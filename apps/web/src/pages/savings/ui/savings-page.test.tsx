import type { BucketResponse, WealthProjectionResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { SavingsPage } from './savings-page.js';

const bucket = (overrides: Partial<BucketResponse> = {}): BucketResponse => ({
  id: 'reserve',
  name: 'Reserve',
  purpose: '',
  mode: 'GOAL',
  status: 'ACTIVE',
  priority: 1,
  balance: 3_000_000,
  contributed: 3_000_000,
  yielded: 0,
  target: 6_000_000,
  targetDate: '2027-12-31',
  percentComplete: 50,
  rule: { kind: 'PERCENT', percent: 20 },
  expectedYieldPercent: 10,
  events: [],
  ...overrides,
});

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <SavingsPage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SavingsPage', () => {
  it('explains the two kinds when there are none', async () => {
    stubApi({ '/api/buckets': [] });
    renderPage();

    expect(await screen.findByText('No buckets yet')).toBeInTheDocument();
  });

  it('shows progress toward a goal', async () => {
    stubApi({ '/api/buckets': [bucket()] });
    renderPage();

    expect(await screen.findByText('Reserve')).toBeInTheDocument();
    expect(screen.getByText(/50% of/)).toBeInTheDocument();
  });

  // Reporting progress toward a target that does not exist is the bug the
  // mode distinction prevents.
  it('shows no progress bar for an ongoing bucket', async () => {
    stubApi({
      '/api/buckets': [
        bucket({
          id: 'investments',
          name: 'Investments',
          mode: 'ONGOING',
          target: null,
          targetDate: null,
          percentComplete: null,
        }),
      ],
    });
    renderPage();

    expect(
      await screen.findByText(/no target to hit, the question is whether/),
    ).toBeInTheDocument();
  });

  it('keeps growth from saving apart from growth from returns', async () => {
    stubApi({
      '/api/buckets': [bucket({ contributed: 2_900_000, yielded: 100_000 })],
    });
    renderPage();

    const summary = await screen.findByText(/saved/);

    expect(summary).toHaveTextContent('R$ 29.000,00');
    expect(summary).toHaveTextContent('R$ 1.000,00');
  });

  // The spreadsheet overwrote its running total with no trace of why.
  it('shows the event history with the reason for a correction', async () => {
    stubApi({
      '/api/buckets': [
        bucket({
          events: [
            {
              id: 'e1',
              kind: 'CORRECTION',
              when: '2026-09-01',
              amount: 845_020,
              reason: 'statement differed after fees',
              ruleWouldHaveBeen: null,
            },
          ],
        }),
      ],
    });
    renderPage();

    expect(await screen.findByText('correction')).toBeInTheDocument();
    expect(
      screen.getByText('statement differed after fees'),
    ).toBeInTheDocument();
  });

  it('says nothing has moved when the log is empty', async () => {
    stubApi({ '/api/buckets': [bucket()] });
    renderPage();

    expect(
      await screen.findByText('Nothing has moved yet'),
    ).toBeInTheDocument();
  });

  it('dims an archived bucket but keeps it readable', async () => {
    stubApi({ '/api/buckets': [bucket({ status: 'ARCHIVED' })] });
    renderPage();

    expect(await screen.findByText('archived')).toBeInTheDocument();
  });

  it('offers to adjust the rule, record an event and archive', async () => {
    stubApi({ '/api/buckets': [bucket({ name: 'Apartment' })] });
    renderPage();

    expect(
      await screen.findByRole('button', {
        name: 'Adjust the rule for Apartment',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Record on Apartment' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Archive Apartment' }),
    ).toBeInTheDocument();
  });

  // An archived bucket is readable, not editable back into the projections.
  it('does not offer to archive one already archived', async () => {
    stubApi({
      '/api/buckets': [bucket({ name: 'Apartment', status: 'ARCHIVED' })],
    });
    renderPage();

    await screen.findByText('Apartment');

    expect(
      screen.queryByRole('button', { name: 'Archive Apartment' }),
    ).not.toBeInTheDocument();
  });
});

const projection = (
  overrides: Partial<WealthProjectionResponse> = {},
): WealthProjectionResponse => ({
  horizons: [5, 10, 20, 30].map((years) => ({
    years,
    total: years * 1_000_000,
    byBucket: [
      { bucketId: 'retirement', name: 'Retirement', amount: years * 1_000_000 },
    ],
  })),
  buckets: [],
  retirement: null,
  ...overrides,
});

const ongoingProjection = {
  bucketId: 'retirement',
  name: 'Retirement',
  isGoal: false,
  contributionPerCycle: 100_000,
  expectedYieldPercent: 8,
  reachesTargetIn: null,
  target: null,
  targetDate: null,
  isOnTrack: null,
  contributionToCatchUp: null,
  inFiveYears: 5_000_000,
  inTenYears: 12_000_000,
};

/**
 * UC-7 merged into this screen when the Wealth Projection screen went: the
 * projection sits beneath the buckets that feed it rather than on a page of
 * its own.
 */
describe('SavingsPage projects what the buckets grow into', () => {
  it('shows the four horizons beneath the buckets', async () => {
    stubApi({
      '/api/buckets': [bucket()],
      '/api/wealth': projection({ buckets: [ongoingProjection] }),
    });
    renderPage();

    expect(await screen.findByText('5 years')).toBeInTheDocument();
    expect(screen.getByText('30 years')).toBeInTheDocument();
  });

  // UC-7.3 — an ongoing bucket has no finish line.
  it('reads an ongoing bucket in its own terms', async () => {
    stubApi({
      '/api/buckets': [bucket()],
      '/api/wealth': projection({ buckets: [ongoingProjection] }),
    });
    renderPage();

    expect(
      await screen.findByText(/No target to hit — the question is only/),
    ).toBeInTheDocument();
    expect(screen.getByText('ongoing')).toBeInTheDocument();
  });

  it('flags a goal that is behind, with the contribution that fixes it', async () => {
    stubApi({
      '/api/buckets': [bucket()],
      '/api/wealth': projection({
        buckets: [
          {
            bucketId: 'apartment',
            name: 'Apartment',
            isGoal: true,
            contributionPerCycle: 177_800,
            expectedYieldPercent: 8,
            reachesTargetIn: null,
            target: 15_000_000,
            targetDate: '2031-03-31',
            isOnTrack: false,
            contributionToCatchUp: 250_000,
            inFiveYears: null,
            inTenYears: null,
          },
        ],
      }),
    });
    renderPage();

    expect(await screen.findByText('behind')).toBeInTheDocument();
    expect(
      screen.getByText(/per cycle would bring it back/),
    ).toBeInTheDocument();
  });

  // Retirement is measured in monthly income, not in a lump sum.
  it('states retirement as a monthly income', async () => {
    stubApi({
      '/api/buckets': [bucket()],
      '/api/wealth': projection({
        buckets: [ongoingProjection],
        retirement: {
          bucketId: 'retirement',
          name: 'Retirement',
          balanceAtHorizon: 30_000_000,
          sustainableMonthlyIncome: 100_000,
        },
      }),
    });
    renderPage();

    expect(await screen.findByText(/a month/)).toBeInTheDocument();
    expect(
      screen.getByText(/An assumption, like every yield here/),
    ).toBeInTheDocument();
  });
});
