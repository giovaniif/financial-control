import type { BackupDocument } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { BackupRestore } from './backup-restore.js';

const document_: BackupDocument = {
  version: 1,
  exportedAt: '2026-08-11T12:00:00.000Z',
  anchor: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
  accounts: [{ id: 'a1', name: 'Inter', type: 'CHECKING', balance: 216_000 }],
  cycles: [],
  templates: [],
  cards: [],
  buckets: [],
};

const counts = { accounts: 3, cycles: 4, templates: 12, cards: 2, buckets: 5 };

function stubApiWith(body: unknown = document_, status = 200) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubDownload() {
  const click = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:fake');
  const revokeObjectURL = vi.fn();

  vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);

  return { click, createObjectURL };
}

const render = () => renderWithProviders(<BackupRestore counts={counts} />);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BackupRestore', () => {
  it('downloads the document, named for the day it was taken', async () => {
    stubApiWith();
    const { createObjectURL } = stubDownload();
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledOnce();
    });
    expect(
      await screen.findByText(/financial-control-2026-08-11\.json/),
    ).toBeInTheDocument();
  });

  /**
   * A restore replaces everything. What it replaces is stated in counts, not
   * in prose, because "all your data" is not something anyone can check.
   */
  it('says exactly what an import would replace', async () => {
    stubApiWith();
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    const warning = screen.getByRole('alert');

    expect(warning).toHaveTextContent('3 accounts');
    expect(warning).toHaveTextContent('4 cycles');
    expect(warning).toHaveTextContent('12 templates');
    expect(warning).toHaveTextContent('2 cards');
    expect(warning).toHaveTextContent('5 buckets');
  });

  it('will not import until a file has been chosen', async () => {
    stubApiWith();
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(
      screen.getByRole('button', { name: 'Replace everything' }),
    ).toBeDisabled();
  });

  it('sends the chosen document to the API', async () => {
    const fetchMock = stubApiWith(null, 204);
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    await userEvent.upload(
      screen.getByLabelText('Backup file'),
      fileOf(document_),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Replace everything' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/restore',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('reports a refusal in the API’s own words', async () => {
    stubApiWith({ error: 'This backup says version 99.' }, 400);
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    await userEvent.upload(
      screen.getByLabelText('Backup file'),
      fileOf({ ...document_, version: 99 }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Replace everything' }),
    );

    expect(
      await screen.findByText('This backup says version 99.'),
    ).toBeInTheDocument();
  });

  // The file picker's `accept` keeps out a .txt; a hand-edited .json is what
  // actually arrives broken.
  it('refuses an unreadable file before sending anything', async () => {
    const fetchMock = stubApiWith();
    render();

    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    await userEvent.upload(
      screen.getByLabelText('Backup file'),
      new File(['{ half a doc'], 'backup.json', {
        type: 'application/json',
      }),
    );

    expect(
      await screen.findByText(/could not be read as a backup/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says this is the only way data leaves the app', () => {
    stubApiWith();
    render();

    expect(
      screen.getByText(/nothing takes snapshots behind you/i),
    ).toBeInTheDocument();
  });
});

function fileOf(body: unknown): File {
  return new File([JSON.stringify(body)], 'backup.json', {
    type: 'application/json',
  });
}
