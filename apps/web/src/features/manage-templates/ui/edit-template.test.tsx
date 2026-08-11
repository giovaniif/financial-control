import type { TemplateResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/shared/testing';

import { EditTemplate } from './edit-template.js';

const template = (overrides: Partial<TemplateResponse> = {}) => ({
  id: 't1',
  name: 'Salary',
  direction: 'IN' as const,
  dueDayOfMonth: 5,
  amount: 1_000_000,
  status: 'ACTIVE' as const,
  isEstimate: false,
  startMonth: '2026-01',
  endMonth: null,
  valueSchedule: [],
  nextOccurrenceMonth: '2026-08',
  ...overrides,
});

function stubPatch() {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof stubPatch>) {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  const call = calls[calls.length - 1];

  return {
    url: call?.[0] ?? '',
    body: JSON.parse((call?.[1].body ?? '{}') as string) as Record<
      string,
      unknown
    >,
  };
}

const renderEdit = (overrides: Partial<TemplateResponse> = {}) =>
  renderWithProviders(
    <EditTemplate template={template(overrides)} currentMonth="2026-09" />,
  );

const openAmount = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Edit Salary' }));
  await userEvent.click(screen.getByRole('button', { name: 'Change amount' }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EditTemplate', () => {
  /**
   * The critical interaction: salary at 10.000 through August and 18.000 from
   * September on is one template with a change applied "this and future" —
   * not two templates, and not twelve manual edits.
   */
  it('applies a change from this cycle onward', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await openAmount();
    await userEvent.clear(screen.getByLabelText('New amount'));
    await userEvent.type(screen.getByLabelText('New amount'), '18.000');
    await userEvent.click(
      screen.getByRole('radio', { name: /This cycle and all future/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).url).toBe('/api/templates/t1/amount');
    });
    expect(lastCall(fetchMock).body).toEqual({
      fromMonth: '2026-09',
      amount: 1_800_000,
      scope: 'THIS_AND_FUTURE',
    });
  });

  it('applies a change to this cycle only', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await openAmount();
    await userEvent.clear(screen.getByLabelText('New amount'));
    await userEvent.type(screen.getByLabelText('New amount'), '9.000');
    await userEvent.click(
      screen.getByRole('radio', { name: /This cycle only/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toMatchObject({
        scope: 'THIS_CYCLE_ONLY',
      });
    });
  });

  // The scope choice is the whole point, so neither option is preselected.
  it('will not apply until a scope has been chosen', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await openAmount();
    await userEvent.clear(screen.getByLabelText('New amount'));
    await userEvent.type(screen.getByLabelText('New amount'), '9.000');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose whether this applies to one cycle or to every cycle from here',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says past cycles are never touched, whichever scope is chosen', async () => {
    stubPatch();
    renderEdit();

    await openAmount();

    expect(
      screen.getByText(/Past cycles are never touched/),
    ).toBeInTheDocument();
  });

  it('pauses an active template', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Salary' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ status: 'PAUSED' });
    });
  });

  it('resumes a paused one with no data lost', async () => {
    const fetchMock = stubPatch();
    renderEdit({ status: 'PAUSED' });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Salary' }));
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ status: 'ACTIVE' });
    });
  });

  it('ends a template on a cycle, stopping future generation', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Salary' }));
    await userEvent.clear(screen.getByLabelText('End after cycle'));
    await userEvent.type(screen.getByLabelText('End after cycle'), '2026-12');
    await userEvent.click(screen.getByRole('button', { name: 'End it' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ endMonth: '2026-12' });
    });
  });

  it('toggles the estimate flag', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Salary' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Flag as an estimate' }),
    );

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ isEstimate: true });
    });
  });

  it('renames a template', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Salary' }));
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Salary (new job)');
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ name: 'Salary (new job)' });
    });
  });
});
