import type { BucketResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { AdjustRule } from './adjust-rule.js';

const bucket = (overrides: Partial<BucketResponse> = {}): BucketResponse => ({
  id: 'b1',
  name: 'Apartment',
  purpose: '',
  mode: 'GOAL',
  status: 'ACTIVE',
  priority: 1,
  balance: 3_600_000,
  contributed: 3_600_000,
  yielded: 0,
  target: 15_000_000,
  targetDate: '2031-03-31',
  percentComplete: 24,
  rule: { kind: 'PERCENT', percent: 20 },
  expectedYieldPercent: 8,
  events: [],
  ...overrides,
});

const preview = {
  month: '2026-08',
  expectedSurplus: 889_000,
  fundings: [],
  shortfall: 0,
  isOvercommitted: false,
};

const renderRule = (overrides: Partial<BucketResponse> = {}) =>
  renderWithProviders(
    <AdjustRule bucket={bucket(overrides)} month="2026-08" />,
  );

const open = () =>
  userEvent.click(
    screen.getByRole('button', { name: 'Ajustar a regra de Apartment' }),
  );

function lastBody(fetchMock: ReturnType<typeof vi.fn>) {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  const write = calls.filter((call) => call[1].method !== undefined);
  const last = write[write.length - 1];

  return JSON.parse((last?.[1].body ?? '{}') as string) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdjustRule', () => {
  it('sets a percentage of Expected Surplus', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule();

    await open();
    await userEvent.clear(screen.getByLabelText('Percentual'));
    await userEvent.type(screen.getByLabelText('Percentual'), '25');
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar a regra' }),
    );

    await waitFor(() => {
      expect(lastBody(globalThis.fetch as ReturnType<typeof vi.fn>)).toEqual({
        rule: { kind: 'PERCENT', percent: 25 },
      });
    });
  });

  /**
   * UC-6.2 — the choice is made with both readings visible: a percentage in
   * reais, and a fixed amount as a share of this cycle's Expected Surplus.
   */
  it('shows a percentage in reais against this cycle', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule();

    await open();

    expect(
      await screen.findByText(/20% → R\$ 1\.778,00 neste ciclo/),
    ).toBeInTheDocument();
  });

  it('shows a fixed amount as a share of Expected Surplus', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule({ rule: { kind: 'FIXED', amount: 177_800 } });

    await open();

    expect(
      await screen.findByText(
        /R\$ 1\.778,00 → 20,0% da Sobra Esperada deste ciclo/,
      ),
    ).toBeInTheDocument();
  });

  it('switches the rule to a fixed amount', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule();

    await open();
    await userEvent.selectOptions(screen.getByLabelText('Regra'), 'Valor fixo');
    await userEvent.clear(screen.getByLabelText('Valor por ciclo'));
    await userEvent.type(screen.getByLabelText('Valor por ciclo'), '1.778,00');
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar a regra' }),
    );

    await waitFor(() => {
      expect(lastBody(globalThis.fetch as ReturnType<typeof vi.fn>)).toEqual({
        rule: { kind: 'FIXED', amount: 177_800 },
      });
    });
  });

  // UC-6.3 — lowest priority funded first when the money runs short.
  it('sets the priority order', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule();

    await open();
    await userEvent.clear(screen.getByLabelText('Prioridade'));
    await userEvent.type(screen.getByLabelText('Prioridade'), '2');
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar prioridade' }),
    );

    await waitFor(() => {
      expect(lastBody(globalThis.fetch as ReturnType<typeof vi.fn>)).toEqual({
        priority: 2,
      });
    });
  });

  it('sets the expected yield, labelled as the assumption it is', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule();

    await open();

    expect(
      screen.getByText(/Uma premissa, não uma promessa/),
    ).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Rendimento anual esperado'));
    await userEvent.type(
      screen.getByLabelText('Rendimento anual esperado'),
      '9',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar o rendimento' }),
    );

    await waitFor(() => {
      expect(lastBody(globalThis.fetch as ReturnType<typeof vi.fn>)).toEqual({
        expectedYieldPercent: 9,
      });
    });
  });

  it('refuses a percentage outside 0 to 100', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule();

    await open();
    await userEvent.clear(screen.getByLabelText('Percentual'));
    await userEvent.type(screen.getByLabelText('Percentual'), '140');
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar a regra' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Entre 0 e 100');
  });

  // UC-6.4 — the warning names the cycle, the shortfall and who gets funded.
  it('warns when the rules run past the money', async () => {
    stubApi({
      '/api/cycles/2026-08/allocation-preview': {
        ...preview,
        isOvercommitted: true,
        shortfall: 212_000,
        fundings: [
          {
            bucketId: 'b1',
            name: 'Apartment',
            requested: 500_000,
            funded: 288_000,
            isFullyFunded: false,
          },
        ],
      },
    });
    renderRule();

    await open();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Falta R\$ 2\.120,00 para cobrir as regras em August 2026/,
    );
    expect(
      screen.getByText(/Apartment recebe R\$ 2\.880,00/),
    ).toBeInTheDocument();
  });
});
