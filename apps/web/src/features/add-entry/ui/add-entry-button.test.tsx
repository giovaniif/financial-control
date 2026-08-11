import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { AddEntryButton } from './add-entry-button.js';

function stubPost() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ id: 'e1' }), { status: 201 }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderButton() {
  return renderWithProviders(
    <AddEntryButton month="2026-08" start="2026-08-05" end="2026-09-04" />,
  );
}

async function open() {
  await userEvent.click(screen.getByRole('button', { name: 'Add an entry' }));
}

function bodyOf(fetchMock: ReturnType<typeof stubPost>) {
  const call = fetchMock.mock.calls[0] as unknown as
    [string, RequestInit] | undefined;

  return JSON.parse((call?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AddEntryButton', () => {
  it('opens a form for the one-off no template covers', async () => {
    stubPost();
    renderButton();

    await open();

    expect(
      screen.getByRole('dialog', { name: 'Add an entry' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  // Money out is negative in the domain; the form asks for a direction rather
  // than expecting a minus sign to be typed.
  it('sends an outgoing amount as negative cents', async () => {
    const fetchMock = stubPost();
    renderButton();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Shared dinner');
    await userEvent.type(screen.getByLabelText('Amount'), '1.234,56');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cycles/2026-08/entries',
      expect.anything(),
    );
    expect(bodyOf(fetchMock)).toMatchObject({
      description: 'Shared dinner',
      kind: 'VARIABLE',
      amount: -123_456,
      dueDate: '2026-08-05',
    });
  });

  it('sends an incoming amount as positive cents', async () => {
    const fetchMock = stubPost();
    renderButton();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Reimbursement');
    await userEvent.type(screen.getByLabelText('Amount'), '500');
    await userEvent.selectOptions(
      screen.getByLabelText('Direction'),
      'Money in',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({ amount: 50_000 });
    });
  });

  it('flags an entry the user knows is only roughly right', async () => {
    const fetchMock = stubPost();
    renderButton();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Contractor');
    await userEvent.type(screen.getByLabelText('Amount'), '1500');
    await userEvent.click(screen.getByLabelText('Unconfirmed estimate'));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({ isEstimate: true });
    });
  });

  it('refuses an amount it cannot read, rather than sending a zero', async () => {
    const fetchMock = stubPost();
    renderButton();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Dinner');
    await userEvent.type(screen.getByLabelText('Amount'), 'a lot');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter an amount like 1.234,56',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty description', async () => {
    const fetchMock = stubPost();
    renderButton();

    await open();
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Say what the entry is for',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The due date is what assigns an entry to a cycle, so one outside the
  // cycle is caught here rather than bounced back by the API.
  it('refuses a due date outside the cycle', async () => {
    const fetchMock = stubPost();
    renderButton();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Dinner');
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await userEvent.clear(screen.getByLabelText('Due date'));
    await userEvent.type(screen.getByLabelText('Due date'), '2026-09-30');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'must fall inside 5 Aug – 4 Sep',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes once the entry is added', async () => {
    stubPost();
    renderButton();

    await open();
    await userEvent.type(screen.getByLabelText('Description'), 'Dinner');
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
