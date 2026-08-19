import { describe, expect, it } from 'vitest';

import { Principal } from '../../domain/shared/principal.js';

import { InMemoryProposalStore } from './in-memory-proposal-store.js';

const proposal = (id: string, appliedAt?: Date) => ({
  id,
  principal: Principal.sole(),
  change: 'SETTLE_ENTRY',
  summary: 'Settle entry rent-1 in the 2026-10 cycle as paid.',
  proposedAt: new Date('2026-08-10T12:00:00Z'),
  appliedAt,
});

describe('InMemoryProposalStore', () => {
  it('hands back the proposal it was given', async () => {
    const store = new InMemoryProposalStore<string>();
    await store.save(proposal('proposal-1'));

    expect((await store.load('proposal-1'))?.summary).toContain('rent-1');
  });

  it('replaces a proposal when it is saved as applied', async () => {
    const store = new InMemoryProposalStore<string>();
    const applied = new Date('2026-08-10T12:05:00Z');
    await store.save(proposal('proposal-1'));
    await store.save(proposal('proposal-1', applied));

    expect((await store.load('proposal-1'))?.appliedAt).toEqual(applied);
  });

  it('holds nothing for a proposal it never saw', async () => {
    const store = new InMemoryProposalStore<string>();

    expect(await store.load('proposal-9')).toBeUndefined();
  });
});
