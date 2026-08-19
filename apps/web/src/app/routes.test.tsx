import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { routes } from './routes.js';

/** Every screen sits behind the first-run gate, which a pristine app fails. */
const configured = {
  anchorConfigured: true,
  accounts: 1,
  cards: 1,
  templates: 1,
  buckets: 1,
  isPristine: false,
};

function renderAt(path: string) {
  return renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

/** Enough of a dashboard for Main to render — its figures are Main's own test. */
const dashboard = {
  today: '2026-08-19',
  currentCycleMonth: '2026-08',
  estimates: 'included',
  headline: {
    cycleMonth: '2026-08',
    cycleLabel: 'August 2026',
    range: '5 Aug – 4 Sep',
    incoming: 0,
    outgoing: 0,
    free: 0,
    lowestPoint: 0,
    lowestPointDate: '2026-08-19',
    closing: 0,
    closingWithoutEstimates: 0,
  },
  kpis: [],
  progress: {
    dayOfCycle: 1,
    cycleLength: 30,
    timePercent: 0,
    spent: 0,
    plannedOut: 0,
    spentPercent: 0,
  },
  upcoming: [],
  alerts: [],
};

beforeEach(() => {
  localStorage.clear();
  stubApi({ '/api/setup': configured, '/api/dashboard': dashboard });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('routes', () => {
  it.each([
    ['/', 'Principal'],
    ['/profile', 'Perfil'],
    ['/savings', 'Investimentos e Reservas'],
    ['/onboarding', 'Configurando'],
  ])('renders %s as the %s screen', async (path, heading) => {
    renderAt(path);

    expect(
      await screen.findByRole('heading', { level: 1, name: heading }),
    ).toBeInTheDocument();
  });

  it('shows a not-found screen for an unknown route', async () => {
    renderAt('/nowhere');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Página não encontrada',
      }),
    ).toBeInTheDocument();
  });

  /**
   * The seven screens became three. The four that went are reachable through
   * the assistant instead, so their old paths are ordinary unknown routes —
   * not redirects to somewhere that half-answers.
   */
  it.each(['/ledger', '/cards', '/templates', '/wealth', '/settings'])(
    'no longer serves %s',
    async (path) => {
      renderAt(path);

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Página não encontrada',
        }),
      ).toBeInTheDocument();
    },
  );

  /**
   * UC-8 — the assistant answers the questions the screens did not
   * anticipate, so it is reachable from every screen rather than from Main.
   */
  it.each(['/', '/profile', '/savings'])(
    'offers the assistant on %s',
    async (path) => {
      renderAt(path);

      await userEvent.click(
        await screen.findByRole('button', { name: 'Abrir o assistente' }),
      );

      expect(
        screen.getByRole('log', { name: 'Conversa com o assistente' }),
      ).toBeVisible();
    },
  );
});
