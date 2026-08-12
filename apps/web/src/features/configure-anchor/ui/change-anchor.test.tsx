import type { AnchorChangePreviewResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { ChangeAnchor } from './change-anchor.js';

const preview = (
  overrides: Partial<AnchorChangePreviewResponse> = {},
): AnchorChangePreviewResponse => ({
  current: { anchorDay: 5, shiftPolicy: 'PRECEDING' },
  proposed: { anchorDay: 7, shiftPolicy: 'PRECEDING' },
  shifts: [
    {
      month: '2026-08',
      currentRange: '5 Aug – 3 Sep',
      proposedRange: '7 Aug – 6 Sep',
      entriesLeaving: 3,
    },
  ],
  totalEntriesMoving: 3,
  orphanedEntries: 0,
  ...overrides,
});

function stubWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const render = () =>
  renderWithProviders(<ChangeAnchor anchorDay={5} shiftPolicy="PRECEDING" />);

const open = () =>
  userEvent.click(screen.getByRole('button', { name: 'Change the anchor' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChangeAnchor', () => {
  /**
   * UC-1.1 — changing the anchor re-slices every open cycle, so the effect is
   * shown and confirmed before anything is written.
   */
  it('previews the effect before changing anything', async () => {
    const fetchMock = stubWith(preview());
    render();

    await open();
    await userEvent.clear(screen.getByLabelText('Day of month'));
    await userEvent.type(screen.getByLabelText('Day of month'), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(
      await screen.findByText(/3 entries would move out of their cycle/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/5 Aug – 3 Sep → 7 Aug – 6 Sep/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/anchor/preview',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not change the anchor until the preview is confirmed', async () => {
    const fetchMock = stubWith(preview());
    render();

    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText(/3 entries would move/);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Apply the change' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings/anchor',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
  });

  it('says closed cycles are never re-sliced', async () => {
    stubWith(preview());
    render();

    await open();

    expect(
      screen.getByText(/Closed cycles are never re-sliced/),
    ).toBeInTheDocument();
  });

  // A change that would leave an entry outside every open cycle is refused.
  it('blocks a change that would orphan an entry', async () => {
    stubWith(preview({ orphanedEntries: 2 }));
    render();

    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(
      await screen.findByText(/2 entries would fall outside every open cycle/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply the change' }),
    ).toBeDisabled();
  });

  it('explains a refusal from the server rather than showing a status code', async () => {
    render();
    await open();

    const fetchMock = vi.fn((input: string) =>
      Promise.resolve(
        input.endsWith('/preview')
          ? new Response(JSON.stringify(preview()), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(
              JSON.stringify({ error: 'Two entries are orphaned.' }),
              {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText(/3 entries would move/);
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply the change' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Two entries are orphaned.',
    );
  });

  it('changes the weekend rule too', async () => {
    const fetchMock = stubWith(preview());
    render();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('When it lands on a weekend or holiday'),
      'The following business day',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

      expect(JSON.parse((call[1].body ?? '{}') as string)).toEqual({
        anchorDay: 5,
        shiftPolicy: 'FOLLOWING',
      });
    });
  });
});
