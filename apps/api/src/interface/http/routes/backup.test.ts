import type { BackupDocument } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { buildTestServer } from '../testing/test-server.js';

describe('GET /backup', () => {
  it('answers a versioned document', async () => {
    const response = await buildTestServer().inject({ url: '/backup' });

    expect(response.statusCode).toBe(200);
    expect(response.json<BackupDocument>().version).toBe(1);
  });

  it('holds every part of the dataset, even when empty', async () => {
    const response = await buildTestServer().inject({ url: '/backup' });

    expect(response.json<BackupDocument>()).toMatchObject({
      accounts: [],
      cycles: [],
      templates: [],
      cards: [],
      buckets: [],
      anchor: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
    });
  });
});

describe('POST /restore', () => {
  const document = (
    overrides: Partial<BackupDocument> = {},
  ): BackupDocument => ({
    version: 1,
    exportedAt: '2026-08-10T12:00:00.000Z',
    anchor: { anchorDay: 7, shiftPolicy: 'FOLLOWING' },
    accounts: [{ id: 'a1', name: 'Inter', type: 'CHECKING', balance: 216_000 }],
    cycles: [],
    templates: [],
    cards: [],
    buckets: [],
    ...overrides,
  });

  it('restores a document and answers 204', async () => {
    const app = buildTestServer();

    const response = await app.inject({
      method: 'POST',
      url: '/restore',
      payload: document(),
    });

    expect(response.statusCode).toBe(204);

    const after = await app.inject({ url: '/backup' });

    expect(after.json<BackupDocument>().accounts).toHaveLength(1);
    expect(after.json<BackupDocument>().anchor.anchorDay).toBe(7);
  });

  it('refuses a version it does not understand', async () => {
    const response = await buildTestServer().inject({
      method: 'POST',
      url: '/restore',
      payload: document({ version: 99 }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toContain('versão 99');
  });

  it('refuses a body that is not a backup at all', async () => {
    const response = await buildTestServer().inject({
      method: 'POST',
      url: '/restore',
      payload: { hello: 'world' },
    });

    expect(response.statusCode).toBe(400);
  });

  // A hand-edited file is the realistic failure, and the aggregate's own
  // complaint says more than "restore failed" would.
  it('explains what was wrong with a malformed document', async () => {
    const response = await buildTestServer().inject({
      method: 'POST',
      url: '/restore',
      payload: document({
        // Cents are integers; a hand-edited fraction is the realistic way a
        // backup file goes wrong.
        accounts: [{ id: 'a1', name: 'Inter', type: 'CHECKING', balance: 1.5 }],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toContain(
      'Não foi possível ler o backup',
    );
  });

  it('round-trips through the API', async () => {
    const app = buildTestServer();
    await app.inject({
      method: 'POST',
      url: '/restore',
      payload: document(),
    });

    const exported = (
      await app.inject({ url: '/backup' })
    ).json<BackupDocument>();
    const again = buildTestServer();
    await again.inject({ method: 'POST', url: '/restore', payload: exported });

    expect((await again.inject({ url: '/backup' })).json()).toEqual(exported);
  });
});
