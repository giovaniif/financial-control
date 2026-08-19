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
    screen.getByRole('button', { name: 'Adjust the rule for Apartment' }),
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
    await userEvent.clear(screen.getByLabelText('Percentage'));
    await userEvent.type(screen.getByLabelText('Percentage'), '25');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the rule' }),
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
      await screen.findByText(/20% → R\$ 1\.778,00 in this cycle/),
    ).toBeInTheDocument();
  });

  it('shows a fixed amount as a share of Expected Surplus', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule({ rule: { kind: 'FIXED', amount: 177_800 } });

    await open();

    expect(
      await screen.findByText(/R\$ 1\.778,00 → 20,0% of this cycle/),
    ).toBeInTheDocument();
  });

  it('switches the rule to a fixed amount', async () => {
    stubApi({ '/api/cycles/2026-08/allocation-preview': preview });
    renderRule();

    await open();
    await userEvent.selectOptions(
      screen.getByLabelText('Rule'),
      'Fixed amount',
    );
    await userEvent.clear(screen.getByLabelText('Amount per cycle'));
    await userEvent.type(screen.getByLabelText('Amount per cycle'), '1.778,00');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the rule' }),
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
    await userEvent.clear(screen.getByLabelText('Priority'));
    await userEvent.type(screen.getByLabelText('Priority'), '2');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save priority' }),
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
      screen.getByText(/An assumption, not a promise/),
    ).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Expected annual yield'));
    await userEvent.type(screen.getByLabelText('Expected annual yield'), '9');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the yield' }),
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
    await userEvent.clear(screen.getByLabelText('Percentage'));
    await userEvent.type(screen.getByLabelText('Percentage'), '140');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save the rule' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Between 0 and 100');
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
      /R\$ 2\.120,00 short in August 2026/,
    );
    expect(
      screen.getByText(/Apartment gets R\$ 2\.880,00/),
    ).toBeInTheDocument();
  });
});
