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
  await userEvent.click(screen.getByRole('button', { name: 'Editar Salary' }));
  await userEvent.click(screen.getByRole('button', { name: 'Alterar valor' }));
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
    await userEvent.clear(screen.getByLabelText('Novo valor'));
    await userEvent.type(screen.getByLabelText('Novo valor'), '18.000');
    await userEvent.click(
      screen.getByRole('radio', { name: /Neste ciclo e nos futuros/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

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
    await userEvent.clear(screen.getByLabelText('Novo valor'));
    await userEvent.type(screen.getByLabelText('Novo valor'), '9.000');
    await userEvent.click(
      screen.getByRole('radio', { name: /Só neste ciclo/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

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
    await userEvent.clear(screen.getByLabelText('Novo valor'));
    await userEvent.type(screen.getByLabelText('Novo valor'), '9.000');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escolha se isso vale para um ciclo ou para todos os ciclos a partir de agora',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says past cycles are never touched, whichever scope is chosen', async () => {
    stubPatch();
    renderEdit();

    await openAmount();

    expect(
      screen.getByText(/Os ciclos passados nunca são alterados/),
    ).toBeInTheDocument();
  });

  it('pauses an active template', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(
      screen.getByRole('button', { name: 'Editar Salary' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ status: 'PAUSED' });
    });
  });

  it('resumes a paused one with no data lost', async () => {
    const fetchMock = stubPatch();
    renderEdit({ status: 'PAUSED' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Editar Salary' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retomar' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ status: 'ACTIVE' });
    });
  });

  it('ends a template on a cycle, stopping future generation', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(
      screen.getByRole('button', { name: 'Editar Salary' }),
    );
    await userEvent.clear(screen.getByLabelText('Encerrar após o ciclo'));
    await userEvent.type(
      screen.getByLabelText('Encerrar após o ciclo'),
      '2026-12',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ endMonth: '2026-12' });
    });
  });

  it('toggles the estimate flag', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(
      screen.getByRole('button', { name: 'Editar Salary' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Marcar como estimativa' }),
    );

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ isEstimate: true });
    });
  });

  it('renames a template', async () => {
    const fetchMock = stubPatch();
    renderEdit();

    await userEvent.click(
      screen.getByRole('button', { name: 'Editar Salary' }),
    );
    await userEvent.clear(screen.getByLabelText('Nome'));
    await userEvent.type(screen.getByLabelText('Nome'), 'Salary (new job)');
    await userEvent.click(screen.getByRole('button', { name: 'Renomear' }));

    await waitFor(() => {
      expect(lastCall(fetchMock).body).toEqual({ name: 'Salary (new job)' });
    });
  });
});
