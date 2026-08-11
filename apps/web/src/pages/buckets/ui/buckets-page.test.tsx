import type { BucketResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { BucketsPage } from './buckets-page.js';

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
      router={createMemoryRouter([{ path: '/', element: <BucketsPage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BucketsPage', () => {
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
});
