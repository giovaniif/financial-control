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
    await screen.findByRole('button', { name: 'Assistente' }),
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
  /**
   * The estimates toggle is gone. It asked the user to hold two readings of
   * every figure in their head, when the one place the difference matters —
   * the closing balance — already states both on the headline.
   */
  it('offers no estimates toggle', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();
    await screen.findByText('screen body');

    expect(
      screen.queryByRole('button', { name: 'Com estimativas' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Somente confirmados' }),
    ).not.toBeInTheDocument();
  });

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
    expect(screen.getByRole('button', { name: 'Assistente' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
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

  /**
   * With the rail open the header has a third of its width taken, and three
   * full-width controls beside a title wrapped onto a second row. They fold
   * to icons instead — but an icon with no name is a worse header than a
   * wrapped one, so each keeps the name it had.
   */
  it('keeps every header control named once they fold to icons', async () => {
    stubApi({
      '/api/cycles': window_,
      '/api/accounts': {
        accounts: [{ id: 'a', name: 'Inter', type: 'CHECKING', balance: 1 }],
        total: 1,
      },
    });
    renderShell();

    await openRail();

    expect(await screen.findByTitle(/Nas contas agora/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ciclo anterior' }),
    ).toBeInTheDocument();
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
    expect(screen.getByTitle(/Nas contas agora/)).toBeInTheDocument();
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
   * A 380px column and a readable column of figures do not both fit below
   * 64rem, so there the chat rises as a sheet over the screen instead — the
   * shape a conversation takes on a phone.
   */
  it('rises as a sheet rather than a column on a narrow window', async () => {
    stubWidth(false);
    stubApi({ '/api/cycles': window_ });
    renderShell();

    await openRail();

    expect(
      screen.getByRole('complementary', { name: 'Assistente' }),
    ).toHaveAttribute('data-layout', 'sheet');
  });

  /**
   * Folded away, the chat is one floating control on the same side the rail
   * opens on — not a second strip standing beside the nav, which read as
   * another bar to account for rather than a way back into the chat.
   */
  it('folds away to a single floating control, not a strip', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();

    const tab = await screen.findByRole('button', {
      name: 'Assistente',
    });
    const body = screen.getByRole('main');

    expect(
      body.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    // The label belongs to the button: a strip with its own vertical caption
    // beside an icon is the second bar this replaced.
    expect(screen.getAllByText('Assistente')).toHaveLength(1);
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

/**
 * Below 64rem the nav cannot hold a column of its own without leaving the
 * figures unreadable, so it becomes a drawer — the same three links, reached
 * from the header rather than standing beside the content.
 */
describe('AppShell on a phone', () => {
  beforeEach(() => {
    stubWidth(false);
  });

  /**
   * Three stacked rows of chrome — title, subtitle, cycle, toggle — was most
   * of the fold on a phone before a single figure. The subtitle goes (it
   * truncated to nothing useful anyway) and the toggle joins the title's row
   * as an icon, leaving two rows: what screen this is, and which cycle.
   */
  it('spends two rows on the header, not four', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();
    await screen.findByText('screen body');

    expect(screen.queryByText('O próximo pagamento')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Principal' }),
    ).toBeInTheDocument();
  });

  it('keeps the nav behind a menu rather than beside the figures', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();
    await screen.findByText('screen body');

    expect(
      screen.queryByRole('link', { name: 'Perfil' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }));

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Principal', 'Perfil', 'Investimentos e Reservas'],
    );
  });

  // The drawer covers the screen it navigates to, so it has to get out of the
  // way once the choice is made.
  it('closes the drawer once a screen is picked', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();
    await screen.findByText('screen body');

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }));
    await userEvent.click(screen.getByRole('link', { name: 'Principal' }));

    expect(
      screen.queryByRole('link', { name: 'Perfil' }),
    ).not.toBeInTheDocument();
  });

  it('closes the drawer from the backdrop behind it', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();
    await screen.findByText('screen body');

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar o menu' }),
    );

    expect(
      screen.queryByRole('link', { name: 'Perfil' }),
    ).not.toBeInTheDocument();
  });

  // UC-1.2 — the total the sidebar exists to keep visible follows the nav
  // into the drawer rather than being dropped on the screen that has least
  // room for it.
  it('carries the accounts total into the drawer', async () => {
    stubApi({
      '/api/cycles': window_,
      '/api/accounts': {
        accounts: [{ id: 'a', name: 'Inter', type: 'CHECKING', balance: 1 }],
        total: 1,
      },
    });
    renderShell();
    await screen.findByText('screen body');

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }));

    expect(await screen.findByText('Nas contas agora')).toBeVisible();
  });
});

describe('AppShell on a wide screen', () => {
  it('needs no menu, because the nav is already on screen', async () => {
    stubApi({ '/api/cycles': window_ });
    renderShell();
    await screen.findByText('screen body');

    expect(
      screen.queryByRole('button', { name: 'Abrir o menu' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Perfil' })).toBeInTheDocument();
  });
});
