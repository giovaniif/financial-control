import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { CreateTemplateButton } from './create-template-button.js';

function stubPost() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 201 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof stubPost>) {
  const call = fetchMock.mock.calls[0] as unknown as
    [string, RequestInit] | undefined;

  return JSON.parse((call?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
}

const open = (name = 'Add a bill') =>
  userEvent.click(screen.getByRole('button', { name }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CreateTemplateButton', () => {
  it('creates a recurring outcome from a name, amount and due day', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Health Plan');
    await userEvent.type(screen.getByLabelText('Amount'), '320');
    await userEvent.clear(screen.getByLabelText('Due day of month'));
    await userEvent.type(screen.getByLabelText('Due day of month'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/templates',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(bodyOf(fetchMock)).toMatchObject({
      name: 'Health Plan',
      direction: 'OUT',
      dueDayOfMonth: 8,
      amount: 32_000,
      startMonth: '2026-08',
    });
  });

  it('creates a recurring income', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Salary');
    await userEvent.type(screen.getByLabelText('Amount'), '18.000');
    await userEvent.selectOptions(
      screen.getByLabelText('Direction'),
      'Money in',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({
        direction: 'IN',
        amount: 1_800_000,
      });
    });
  });

  // UC-2.6 — a placeholder the user knows is only roughly right.
  it('can be flagged as an unconfirmed estimate at creation', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Contractor Costs');
    await userEvent.type(screen.getByLabelText('Amount'), '1.500');
    await userEvent.click(screen.getByLabelText('Unconfirmed estimate'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({ isEstimate: true });
    });
  });

  /**
   * A screen that asks for income and for bills separately has already
   * answered the direction, so the form does not ask it again.
   */
  it('takes its wording and its direction from the caller', async () => {
    const fetchMock = stubPost();
    renderWithProviders(
      <CreateTemplateButton
        currentMonth="2026-08"
        label="Add income"
        direction="IN"
      />,
    );

    await open('Add income');
    expect(screen.queryByLabelText('Direction')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'Salary');
    await userEvent.type(screen.getByLabelText('Amount'), '18.000');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({
        direction: 'IN',
        amount: 1_800_000,
      });
    });
  });

  // A bill whose amount moves is a guess until the user confirms it.
  it('flags an item as an estimate by default when the caller says so', async () => {
    const fetchMock = stubPost();
    renderWithProviders(
      <CreateTemplateButton
        currentMonth="2026-08"
        label="Add a variable bill"
        direction="OUT"
        isEstimateByDefault
      />,
    );

    await open('Add a variable bill');
    await userEvent.type(screen.getByLabelText('Name'), 'Electricity');
    await userEvent.type(screen.getByLabelText('Amount'), '280');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(bodyOf(fetchMock)).toMatchObject({ isEstimate: true });
    });
  });

  it('refuses a due day outside a month', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Name'), 'Rent');
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await userEvent.clear(screen.getByLabelText('Due day of month'));
    await userEvent.type(screen.getByLabelText('Due day of month'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A day between 1 and 31',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an unnamed item', async () => {
    const fetchMock = stubPost();
    renderWithProviders(<CreateTemplateButton currentMonth="2026-08" />);

    await open();
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Give it a name');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
