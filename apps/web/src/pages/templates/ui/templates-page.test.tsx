import type { TemplatesResponse } from '@fin/contracts';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { TemplatesPage } from './templates-page.js';

const templates = (
  overrides: Partial<TemplatesResponse> = {},
): TemplatesResponse => ({
  templates: [],
  summary: {
    fixedCommitment: 210_000,
    activeOutcomeCount: 3,
    fixedIncome: 1_800_000,
    unconfirmedEstimates: 150_000,
    endingWithinTwelve: [],
  },
  ...overrides,
});

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <TemplatesPage /> }])}
    />,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TemplatesPage', () => {
  it('shows the four summary figures', async () => {
    stubApi({ '/api/templates': templates() });
    renderPage();

    expect(
      await screen.findByText('Fixed commitment / cycle'),
    ).toBeInTheDocument();
    expect(screen.getByText('3 active outcome templates')).toBeInTheDocument();
    expect(screen.getByText('Unconfirmed estimates')).toBeInTheDocument();
  });

  it('says what is about to fall off', async () => {
    stubApi({
      '/api/templates': templates({
        summary: {
          ...templates().summary,
          endingWithinTwelve: ['Legal Fees', 'Therapy'],
        },
      }),
    });
    renderPage();

    expect(await screen.findByText('Legal Fees, Therapy')).toBeInTheDocument();
  });

  it('explains what a template is when there are none', async () => {
    stubApi({ '/api/templates': templates() });
    renderPage();

    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
  });

  it('lists a template with its due day and next occurrence', async () => {
    stubApi({
      '/api/templates': templates({
        templates: [
          {
            id: 't1',
            name: 'Health Plan',
            direction: 'OUT',
            dueDayOfMonth: 8,
            amount: -32_000,
            status: 'ACTIVE',
            isEstimate: false,
            startMonth: '2026-08',
            endMonth: null,
            valueSchedule: [],
            nextOccurrenceMonth: '2026-09',
          },
        ],
      }),
    });
    renderPage();

    expect(await screen.findByText('Health Plan')).toBeInTheDocument();
    expect(screen.getByText('day 8')).toBeInTheDocument();
    expect(screen.getByText('2026-09')).toBeInTheDocument();
  });

  // UC-2.4 — a climbing cost has to be legible as steps, not one number.
  it('expands a value schedule in place', async () => {
    stubApi({
      '/api/templates': templates({
        templates: [
          {
            id: 't1',
            name: 'Renovation Progress',
            direction: 'OUT',
            dueDayOfMonth: 20,
            amount: -120_000,
            status: 'ACTIVE',
            isEstimate: false,
            startMonth: '2026-08',
            endMonth: null,
            valueSchedule: [
              { fromMonth: '2026-09', amount: -125_000 },
              { fromMonth: '2026-10', amount: -130_000 },
            ],
            nextOccurrenceMonth: '2026-08',
          },
        ],
      }),
    });
    renderPage();

    expect(await screen.findByText('value schedule')).toBeInTheDocument();
    expect(screen.getByText('from 2026-09')).toBeInTheDocument();
    expect(screen.getByText('from 2026-10')).toBeInTheDocument();
  });

  it('tags an unconfirmed estimate', async () => {
    stubApi({
      '/api/templates': templates({
        templates: [
          {
            id: 't1',
            name: 'Contractor Costs',
            direction: 'OUT',
            dueDayOfMonth: 25,
            amount: -150_000,
            status: 'ACTIVE',
            isEstimate: true,
            startMonth: '2026-08',
            endMonth: null,
            valueSchedule: [],
            nextOccurrenceMonth: '2026-08',
          },
        ],
      }),
    });
    renderPage();

    expect(await screen.findByText('~estimate')).toBeInTheDocument();
  });
});
