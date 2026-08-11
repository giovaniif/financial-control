import type { WealthProjectionResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { WealthPage } from './wealth-page.js';

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

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <WealthPage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WealthPage', () => {
  it('says there is nothing to project without buckets', async () => {
    stubApi({ '/api/wealth': projection() });
    renderPage();

    expect(await screen.findByText('Nothing to project')).toBeInTheDocument();
  });

  it('shows the four horizons', async () => {
    stubApi({
      '/api/wealth': projection({
        buckets: [
          {
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
          },
        ],
      }),
    });
    renderPage();

    expect(await screen.findByText('5 years')).toBeInTheDocument();
    expect(screen.getByText('30 years')).toBeInTheDocument();
  });

  // UC-7.3 — an ongoing bucket has no finish line.
  it('reads an ongoing bucket in its own terms', async () => {
    stubApi({
      '/api/wealth': projection({
        buckets: [
          {
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
          },
        ],
      }),
    });
    renderPage();

    expect(
      await screen.findByText(/No target to hit — the question is only/),
    ).toBeInTheDocument();
    expect(screen.getByText('ongoing')).toBeInTheDocument();
  });

  it('flags a goal that is behind, with the contribution that fixes it', async () => {
    stubApi({
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
      '/api/wealth': projection({
        buckets: [
          {
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
          },
        ],
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
