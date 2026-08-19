import type { CycleWindowResponse } from '@fin/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { AppShell } from './app-shell.js';

const window_: CycleWindowResponse = {
  estimates: 'included',
  cycles: [
    {
      month: '2026-07',
      label: 'Julho de 2026',
      start: '2026-07-03',
      end: '2026-08-04',
      position: 'current',
      status: 'OPEN',
      openingBalance: 0,
      closingBalance: 0,
      netSurplus: 0,
      isMaterialised: true,
    },
    {
      month: '2026-08',
      label: 'Agosto de 2026',
      start: '2026-08-05',
      end: '2026-09-04',
      position: 'next',
      status: 'OPEN',
      openingBalance: 0,
      closingBalance: 0,
      netSurplus: 0,
      isMaterialised: false,
    },
  ],
};

function renderShell(initialEntry = '/') {
  return renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: '/',
            element: (
              <AppShell title="Principal" subtitle="O próximo pagamento">
                <p>screen body</p>
              </AppShell>
            ),
          },
        ],
        { initialEntries: [initialEntry] },
      )}
    />,
  );
}

/** A window wide enough for the rail to sit beside the figures. */
function stubWidth(isWide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      matches: isWide,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

/** A transcript already on this machine, as a reload would find it. */
function storeConversation() {
  localStorage.setItem(
    'fin.assistant',
    JSON.stringify({
      conversationId: 'c1',
      entries: [
        { kind: 'question', text: 'Why is September lower than August?' },
        {
          kind: 'answer',
          text: 'Because the Inter invoice lands in it.',
          reads: [],
          proposals: [
            {
              proposal: {
                id: 'p1',
                kind: 'ADD_ENTRY',
                summary:
                  'Add \u201cDentist\u201d to the 2026-09 cycle \u2014 a fixed of R$ 300,00 due on 2026-09-20.',
                proposedAt: '2026-08-19T10:00:00.000Z',
              },
              isApplied: false,
            },
          ],
          wasRefused: false,
          hitReadLimit: false,
        },
      ],
    }),
  );
}

const openRail = async () => {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Abrir o assistente' }),
  );
};

beforeEach(() => {
  localStorage.clear();
  stubWidth(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('carries the screen title and its body', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Principal' }),
    ).toBeInTheDocument();
    expect(screen.getByText('screen body')).toBeInTheDocument();
  });

  // The seven screens became three, and the sidebar is where that is felt.
  it('navigates to the three screens and nothing else', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    const links = await screen.findAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Principal',
      'Perfil',
      'Investimentos e Reservas',
    ]);
  });

  // UC-1.2 — the app's starting cash, permanently visible.
  it('shows the accounts total in the sidebar', async () => {
    stubApi({
      '/api/cycles': window_,
      '/api/accounts': {
        accounts: [
          { id: 'a', name: 'Inter', type: 'CHECKING', balance: 200_000 },
          { id: 'b', name: 'Cash', type: 'CASH', balance: 16_000 },
        ],
        total: 216_000,
      },
    });
    renderShell();

    expect(await screen.findByText('R$ 2.160,00')).toBeInTheDocument();
    expect(screen.getByText('2 contas')).toBeInTheDocument();
  });

  it('says "1 conta" rather than "1 contas"', async () => {
    stubApi({
      '/api/cycles': window_,
      '/api/accounts': {
        accounts: [{ id: 'a', name: 'Inter', type: 'CHECKING', balance: 1 }],
        total: 1,
      },
    });
    renderShell();

    expect(await screen.findByText('1 conta')).toBeInTheDocument();
  });

  // A cycle is not a month, so its bounds are always stated.
  it('opens on the current cycle with its date range and position', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    expect(await screen.findByText('Julho de 2026')).toBeInTheDocument();
    expect(screen.getByText('3 jul – 4 ago')).toBeInTheDocument();
    expect(screen.getByText('atual')).toBeInTheDocument();
  });

  it('cannot step back past the first cycle in the window', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    expect(
      await screen.findByRole('button', { name: 'Ciclo anterior' }),
    ).toBeDisabled();
  });

  it('steps forward to the next cycle and back again', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Próximo ciclo' }),
    );

    expect(await screen.findByText('Agosto de 2026')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Próximo ciclo' }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Ciclo anterior' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Julho de 2026')).toBeInTheDocument();
    });
  });

  // The URL is the source of truth, so a cycle link survives a reload.
  it('respects a cycle named in the URL', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell('/?cycle=2026-08');

    expect(await screen.findByText('Agosto de 2026')).toBeInTheDocument();
    expect(screen.getByText('próximo')).toBeInTheDocument();
  });

  it('shows no cycle nav when the window is empty', async () => {
    stubApi({ '/api/cycles': { estimates: 'included', cycles: [] } });
    renderShell();

    expect(await screen.findByText('screen body')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Próximo ciclo' }),
    ).not.toBeInTheDocument();
  });
});

// UC-8 — the assistant answers what the screens did not anticipate, so it
// follows the user rather than living on one of them.
describe('AppShell and the assistant rail', () => {
  it('opens the chat from the tab and closes it from the rail', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    expect(
      screen.queryByRole('log', { name: 'Conversa com o assistente' }),
    ).not.toBeInTheDocument();

    await openRail();

    expect(
      screen.getByRole('log', { name: 'Conversa com o assistente' }),
    ).toBeInTheDocument();

    const close = screen.getByRole('button', {
      name: 'Fechar o assistente',
    });
    expect(close).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(close);

    expect(
      screen.queryByRole('log', { name: 'Conversa com o assistente' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Abrir o assistente' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  /**
   * Collapsing is a change of width, not of state: the rail hides rather than
   * unmounts, so nothing said, drafted or offered is lost by making room for
   * the figures.
   */
  it('keeps the transcript, the draft and a pending proposal while collapsed', async () => {
    storeConversation();
    stubApi({ '/api/cycles': window_ });
    renderShell();

    await openRail();
    await userEvent.type(
      screen.getByLabelText('Pergunte sobre o seu dinheiro'),
      'And in October?',
    );
    expect(
      screen.getByRole('button', { name: 'Confirmar' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar o assistente' }),
    );

    expect(
      screen.getByText('Because the Inter invoice lands in it.'),
    ).not.toBeVisible();

    await openRail();

    expect(
      screen.getByText('Because the Inter invoice lands in it.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Pergunte sobre o seu dinheiro')).toHaveValue(
      'And in October?',
    );
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeVisible();
  });

  // UC-1.2 — the figure the sidebar exists to keep permanently visible does
  // not become a tooltip when the nav folds to icons; it moves to the header.
  it('keeps the accounts total readable while the nav is collapsed', async () => {
    stubApi({
      '/api/cycles': window_,
      '/api/accounts': {
        accounts: [
          { id: 'a', name: 'Inter', type: 'CHECKING', balance: 200_000 },
          { id: 'b', name: 'Cash', type: 'CASH', balance: 16_000 },
        ],
        total: 216_000,
      },
    });
    renderShell();

    await openRail();

    expect(screen.getByText('R$ 2.160,00')).toBeVisible();
    expect(screen.getByText('Nas contas agora')).toBeVisible();
  });

  it('keeps a name on every nav item once the nav is icons only', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    await openRail();

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Principal', 'Perfil', 'Investimentos e Reservas'],
    );
  });

  /**
   * Icons, 380px of chat and the figures do not fit below 64rem, so there the
   * rail covers the content rather than squeezing it into a column too narrow
   * to read.
   */
  it('covers the content rather than pushing it on a narrow window', async () => {
    stubWidth(false);
    stubApi({ '/api/cycles': window_ });
    renderShell();

    await openRail();

    expect(
      screen.getByRole('complementary', { name: 'Assistente' }),
    ).toHaveAttribute('data-layout', 'overlay');
  });

  it('sits beside the content on a wide window', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    await openRail();

    expect(
      screen.getByRole('complementary', { name: 'Assistente' }),
    ).toHaveAttribute('data-layout', 'inline');
  });
});
