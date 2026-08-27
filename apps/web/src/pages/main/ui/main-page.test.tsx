import type {
  BucketResponse,
  CycleResponse,
  CycleSummaryResponse,
  DashboardResponse,
  EstimateMode,
} from '@fin/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { MainPage } from './main-page.js';

const dashboard = (
  overrides: Partial<DashboardResponse> = {},
): DashboardResponse => ({
  today: '2026-08-10',
  currentCycleMonth: '2026-08',
  estimates: 'included',
  variance: null,
  headline: {
    cycleMonth: '2026-09',
    cycleLabel: 'Setembro de 2026',
    range: '4 set – 4 out',
    incoming: 1_800_000,
    outgoing: 911_000,
    free: 355_600,
    closing: 355_600,
    closingWithoutEstimates: 505_600,
    ...overrides.headline,
  },
  kpis: [
    { label: 'Total Outcome', amount: 911_000, note: 'everything out' },
    { label: 'Expected Surplus', amount: 889_000, note: 'to allocate' },
    {
      label: 'Net Surplus',
      amount: 355_600,
      note: 'free cash after allocations',
    },
    {
      label: 'Lowest point in cycle',
      amount: 355_600,
      note: 'on 2026-09-28, after Contractor Costs',
    },
  ],
  progress: {
    dayOfCycle: 6,
    cycleLength: 30,
    timePercent: 20,
    spent: 100_000,
    plannedOut: 200_000,
    spentPercent: 50,
  },
  upcoming: [],
  ...overrides,
});

/**
 * The same cycle read two ways, as the API answers it: the confirmed reading
 * is the one that drops the unconfirmed placeholders.
 */
const cycle = (
  month: string,
  estimates: EstimateMode = 'included',
  overrides: Partial<CycleResponse> = {},
): CycleResponse => {
  const including = estimates === 'included';

  return {
    id: month,
    month,
    label: `${month} label`,
    start: `${month}-04`,
    end: `${month}-28`,
    status: 'OPEN',
    estimates,
    chain: {
      openingBalance: 100_000,
      totalIncome: 1_800_000,
      totalOutcome: including ? 911_000 : 761_000,
      variables: 0,
      surplus: including ? 889_000 : 1_039_000,
      expectedSurplus: including ? 889_000 : 1_039_000,
      allocations: 533_400,
      netSurplus: including ? 355_600 : 505_600,
      closingBalance: including ? 455_600 : 605_600,
    },
    entries: [],
    ...overrides,
  };
};

const summary = (
  month: string,
  position: CycleSummaryResponse['position'],
  overrides: Partial<CycleSummaryResponse> = {},
): CycleSummaryResponse => ({
  month,
  label: `${month} label`,
  start: `${month}-04`,
  end: `${month}-28`,
  status: 'OPEN',
  position,
  openingBalance: 0,
  closingBalance: 0,
  netSurplus: 0,
  isMaterialised: true,
  ...overrides,
});

const window_ = (
  cycles = [summary('2026-08', 'current'), summary('2026-09', 'next')],
) => ({
  estimates: 'included',
  cycles,
});

/**
 * The screen reads the dashboard, the cycle behind it and the buckets, so the
 * stub answers per endpoint. The cycle answers per estimates mode, which is
 * what makes the header's toggle visible in the figures.
 */
/**
 * What the read model answers with estimates switched off, using the same
 * confirmed chain the cycle fixture carries — so a figure asserted here is the
 * figure the server would compute, not one invented for the test.
 */
function confirmedDashboard(body: DashboardResponse): DashboardResponse {
  const confirmedChain = cycle('2026-09', 'excluded').chain;

  return {
    ...body,
    estimates: 'excluded',
    headline: {
      ...body.headline,
      outgoing: confirmedChain.totalOutcome,
      free: confirmedChain.netSurplus,
      closing: confirmedChain.closingBalance,
      closingWithoutEstimates: confirmedChain.closingBalance,
    },
    kpis: body.kpis.map((kpi) =>
      kpi.label === 'Total Outcome'
        ? { ...kpi, amount: confirmedChain.totalOutcome }
        : kpi.label === 'Net Surplus'
          ? { ...kpi, amount: confirmedChain.netSurplus }
          : kpi,
    ),
    upcoming: body.upcoming.filter((entry) => !entry.isEstimate),
  };
}

function respondWith(
  body: DashboardResponse,
  options: {
    buckets?: BucketResponse[];
    fundings?: {
      bucketId: string;
      name: string;
      requested: number;
      funded: number;
      isFullyFunded: boolean;
    }[];
    cycles?: CycleSummaryResponse[];
    cycleFor?: (month: string, estimates: EstimateMode) => CycleResponse;
    assistantAvailable?: boolean;
  } = {},
) {
  const {
    buckets = [],
    fundings,
    cycles,
    cycleFor = (month, estimates) => cycle(month, estimates),
    assistantAvailable = true,
  } = options;
  const months = cycles ?? window_().cycles;

  stubApi({
    // The server builds the dashboard for whichever mode is asked for, so the
    // stub answers both readings rather than the screen reconciling them.
    '/api/dashboard': ({ search }) => {
      const month = search.get('month');
      const confirmed = search.get('estimates') === 'excluded';
      const reading = confirmed ? confirmedDashboard(body) : body;
      return month === null
        ? reading
        : {
            ...reading,
            headline: { ...reading.headline, cycleMonth: month },
          };
    },
    '/api/buckets': buckets,
    // UC-6.4 — the rules resolved against the cycle, in priority order.
    ...Object.fromEntries(
      window_().cycles.map((one) => [
        `/api/cycles/${one.month}/allocation-preview`,
        {
          month: one.month,
          expectedSurplus: 2_168_308,
          fundings:
            fundings ??
            buckets
              .filter((one) => one.status === 'ACTIVE')
              .map((one) => ({
                bucketId: one.id,
                name: one.name,
                requested: 433_662,
                funded: 433_662,
                isFullyFunded: true,
              })),
          shortfall: 0,
          isOvercommitted: false,
        },
      ]),
    ),
    '/api/cycles': { estimates: 'included', cycles: months },
    ...Object.fromEntries(
      months.map((one) => [
        `/api/cycles/${one.month}`,
        ({ search }: { search: URLSearchParams }) =>
          cycleFor(
            one.month,
            (search.get('estimates') ?? 'included') as EstimateMode,
          ),
      ]),
    ),
    '/api/setup': {
      anchorConfigured: true,
      accounts: 1,
      templates: 1,
      buckets: 0,
      isPristine: false,
      assistantAvailable,
    },
  });
}

const renderPage = (entry = '/') =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/', element: <MainPage /> },
          { path: '/savings', element: <p>Savings</p> },
        ],
        { initialEntries: [entry] },
      )}
    />,
  );

const upcoming = (overrides = {}) => ({
  id: 'e1',
  cycleMonth: '2026-09',
  description: 'Electricity',
  dueDate: '2026-09-15',
  amount: -28_000,
  isEstimate: false,
  isOverdue: false,
  daysLate: 0,
  isOverridden: false,
  projectedAmount: null,
  ...overrides,
});

beforeEach(() => {
  respondWith(dashboard());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MainPage', () => {
  it('reads the answer as one sentence', async () => {
    renderPage();

    const headline = await screen.findByText(/fica livre depois das alocações/);

    expect(headline).toHaveTextContent(
      'No ciclo Setembro de 2026 você vai receber',
    );
  });

  it('states the amounts in the headline', async () => {
    renderPage();

    const headline = await screen.findByText(/fica livre depois das alocações/);

    // The same figures also appear as KPI tiles, so this scopes to the sentence.
    expect(headline).toHaveTextContent('R$ 18.000,00');
    expect(headline).toHaveTextContent('R$ 9.110,00');
    expect(headline).toHaveTextContent('R$ 3.556,00');
  });

  /**
   * The closing balance is the chain strip's last stage, and the confirmed
   * reading was a second figure to hold in your head that read *higher* than
   * the real one. `~estimativa` still tags every guess at its source, which
   * is where §6's rule is actually enforced.
   */
  it('leaves the closing-balance pair off the headline', async () => {
    renderPage();

    await screen.findByText(/fica livre depois das alocações/);

    expect(screen.queryByText('Fecha com')).not.toBeInTheDocument();
    expect(screen.queryByText('Sem as estimativas')).not.toBeInTheDocument();
    // Still the last stage of the chain, where it belongs.
    expect(screen.getByText('Saldo final')).toBeInTheDocument();
  });

  /**
   * UC-3.6 — how the cycle came out, beside the figures it qualifies rather
   * than as a fourth tile competing with the chain's three stages.
   */
  it('says a cycle came out worse than planned', async () => {
    respondWith(dashboard({ variance: -3_000 }));

    renderPage();

    expect(await screen.findByText('Pior que o previsto')).toBeInTheDocument();
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
  });

  it('says a cycle came out better than planned', async () => {
    respondWith(dashboard({ variance: 3_000 }));

    renderPage();

    expect(
      await screen.findByText('Melhor que o previsto'),
    ).toBeInTheDocument();
  });

  /**
   * Income is not special-cased: variance is realised minus planned, so a
   * salary that arrived short is behind exactly as a bill that cost more is.
   */
  it('reads income that arrived short as behind, not ahead', async () => {
    respondWith(dashboard({ variance: -100_000 }));

    renderPage();

    expect(await screen.findByText('Pior que o previsto')).toBeInTheDocument();
    expect(screen.queryByText('Melhor que o previsto')).not.toBeInTheDocument();
  });

  it('says so when everything settled went exactly to plan', async () => {
    respondWith(dashboard({ variance: 0 }));

    renderPage();

    expect(await screen.findByText('Saiu como o previsto')).toBeInTheDocument();
  });

  /**
   * A cycle in the future has no variance at all, which is a different thing
   * from one where everything went to plan. It says nothing rather than zero.
   */
  it('says nothing about a projected cycle', async () => {
    respondWith(dashboard({ variance: null }));

    renderPage();

    await screen.findByText(/fica livre depois das alocações/);

    expect(screen.queryByText('Saiu como o previsto')).not.toBeInTheDocument();
    expect(screen.queryByText('Pior que o previsto')).not.toBeInTheDocument();
    expect(screen.queryByText('Melhor que o previsto')).not.toBeInTheDocument();
  });

  /**
   * The tiles restated three of the chain's seven stages one row above it,
   * and the progress card restated Total de Saídas twice more.
   */
  it('states each figure once, in the chain rather than beside it', async () => {
    renderPage();

    await screen.findByText(/fica livre depois das alocações/);

    expect(
      screen.queryByRole('region', { name: 'Figuras principais' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Gasto em relação ao previsto'),
    ).not.toBeInTheDocument();
    // The figures themselves did not go anywhere.
    expect(screen.getByText('Sobra Líquida')).toBeInTheDocument();
  });

  /**
   * UC-4.5 — the only place an entry is settled by hand, so it renders every
   * row it is given. jsdom has no layout, so what is asserted here is the
   * part that would actually break: a region that scrolls has to be reachable
   * from a keyboard, or its later rows are unreachable without a mouse.
   */
  it('renders every entry it is given, in a region a keyboard can scroll', async () => {
    respondWith(
      dashboard({
        upcoming: Array.from({ length: 20 }, (_unused, index) =>
          upcoming({
            id: `e${String(index)}`,
            description: `Bill ${String(index)}`,
          }),
        ),
      }),
    );

    renderPage();

    const list = await screen.findByRole('region', { name: 'A vencer' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    expect(list).toHaveAttribute('tabindex', '0');
  });

  it('says when there is nothing due', async () => {
    renderPage();

    expect(await screen.findByText('Nada a vencer')).toBeInTheDocument();
  });

  /**
   * Main carries no alert list. Every alert it raised restated a figure
   * already on the screen — the closing balance with and without estimates
   * sits in the headline — and a card that says what the number above it
   * already says is a second place to keep correct.
   */
  /** The lowest-point figure is gone from the headline trio too. */
  it('states no lowest point', async () => {
    respondWith(dashboard());
    renderPage();

    await screen.findByText(/fica livre depois das alocações/);

    expect(screen.queryByText('Ponto mais baixo')).not.toBeInTheDocument();
  });

  it('raises no alerts of its own', async () => {
    respondWith(dashboard());
    renderPage();

    await screen.findByText(/fica livre depois das alocações/);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Precisa de atenção')).not.toBeInTheDocument();
  });

  it('lists an overdue entry with how late it is', async () => {
    respondWith(
      dashboard({
        upcoming: [
          upcoming({
            description: 'Renovation Progress',
            dueDate: '2026-08-06',
            amount: -235_000,
            isOverdue: true,
            daysLate: 4,
          }),
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('Renovation Progress')).toBeInTheDocument();
    expect(screen.getByText('4 dias de atraso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument();
  });

  /**
   * UC-3.5 — with the Ledger screen gone this is the only place an entry is
   * settled by hand, so the two-click path has to live here as well as the
   * one-click one.
   */
  /**
   * The ⋯ shows what can be done rather than leaping into a form, and the two
   * amount-changing items are worded apart: one records what moved, the other
   * changes what the cycle expects (UC-3.7).
   */
  it('offers the entry\u2019s other actions behind a menu', async () => {
    respondWith(dashboard({ upcoming: [upcoming()] }));

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Electricity' }),
    );

    expect(
      screen.getByRole('button', { name: 'Pagar com outro valor' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Mudar o valor de Electricity neste mês',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ignorar Electricity neste mês' }),
    ).toBeInTheDocument();
  });

  /**
   * UC-3.7 — an override was a one-way door from this screen until the way
   * back was offered here. It is shown only when there is something to
   * revert, so an ordinary entry's menu is unchanged.
   */
  it('offers the way back only on an overridden entry', async () => {
    respondWith(
      dashboard({
        upcoming: [upcoming({ isOverridden: true, projectedAmount: -28_000 })],
      }),
    );

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Electricity' }),
    );

    expect(
      screen.getByRole('button', {
        name: /Voltar Electricity ao valor previsto/,
      }),
    ).toBeInTheDocument();
  });

  it('offers no way back on an entry nobody overrode', async () => {
    respondWith(dashboard({ upcoming: [upcoming()] }));

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Electricity' }),
    );

    expect(
      screen.queryByRole('button', { name: /Voltar ao previsto/ }),
    ).not.toBeInTheDocument();
  });

  /** Marked at source, the way `~estimativa` marks an unconfirmed figure. */
  it('marks an overridden entry in the worklist', async () => {
    respondWith(
      dashboard({
        upcoming: [upcoming({ isOverridden: true, projectedAmount: -28_000 })],
      }),
    );

    renderPage();

    expect(await screen.findByText('alterado')).toBeInTheDocument();
  });

  it('does not open a form until one is asked for', async () => {
    respondWith(dashboard({ upcoming: [upcoming()] }));

    renderPage();

    await screen.findByRole('button', { name: 'Ações de Electricity' });

    expect(
      screen.queryByRole('button', { name: 'Pagar com outro valor' }),
    ).not.toBeInTheDocument();
  });

  it('offers to confirm money coming in, not settle it', async () => {
    respondWith(
      dashboard({
        upcoming: [upcoming({ description: 'Salary', amount: 1_800_000 })],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Confirmar' }),
    ).toBeInTheDocument();
  });

  it('tags an unconfirmed estimate wherever it appears', async () => {
    respondWith(
      dashboard({
        upcoming: [
          upcoming({ description: 'Contractor Costs', isEstimate: true }),
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('~estimativa')).toBeInTheDocument();
  });

  // UC-4.1 — a cycle with nothing scheduled has no lowest point to name.

  it('shows no bucket chips before there are any buckets', async () => {
    renderPage();

    await screen.findByText(/fica livre depois das alocações/);

    expect(screen.queryByText('Caixinhas')).not.toBeInTheDocument();
  });

  it('shows a goal bucket as progress toward its target', async () => {
    respondWith(dashboard(), { buckets: [goal(), archived()] });

    renderPage();

    expect(await screen.findByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText(/24% da meta/)).toBeInTheDocument();
    // Archived buckets are out of the picture entirely.
    expect(screen.queryByText('Europe Trip')).not.toBeInTheDocument();
  });

  /**
   * The question the card exists to answer: how much goes into each one this
   * cycle. The balance is what that is building, not the headline.
   */
  it('says what goes into a bucket this cycle, and what it has', async () => {
    respondWith(dashboard(), { buckets: [ongoing()] });

    renderPage();

    const region = await screen.findByRole('region', { name: 'Caixinhas' });
    const card = within(region);

    expect(await card.findByText('R$ 4.336,62')).toBeInTheDocument();
    // The rule and the balance sit in one line built from several nodes, so
    // the assertion reads the line rather than a single text node.
    expect(region).toHaveTextContent('20% · acum. R$ 36.000,00');
  });

  // UC-6.4 — a bucket the money did not reach must not read as funded.
  it('says when the rules could not fully fund a bucket', async () => {
    respondWith(dashboard(), {
      buckets: [ongoing()],
      fundings: [
        {
          bucketId: 'b2',
          name: 'Investments',
          requested: 433_662,
          funded: 100_000,
          isFullyFunded: false,
        },
      ],
    });

    renderPage();

    // Scoped: the chain strip carries amounts of its own, and one of them
    // happens to be R$ 1.000,00.
    const card = within(
      await screen.findByRole('region', { name: 'Caixinhas' }),
    );

    // Awaited inside the card: the card renders from the buckets, and the
    // funding arrives from the allocation preview a moment later.
    expect(await card.findByText('R$ 1.000,00')).toBeInTheDocument();
    expect(card.getByText(/parcial/)).toBeInTheDocument();
  });

  /** An ongoing bucket has nothing to complete, so it says nothing about it. */
  it('leaves the empty "nothing to complete" line off every row', async () => {
    respondWith(dashboard(), { buckets: [ongoing()] });

    renderPage();

    await screen.findByText('Investments');

    expect(
      screen.queryByText('contínua — sem objetivo a atingir'),
    ).not.toBeInTheDocument();
  });

  // UC-4.6 — one click through to the screen the bucket belongs to.
  it('leads from a bucket chip to the savings screen', async () => {
    respondWith(dashboard(), { buckets: [goal()] });

    renderPage();

    expect(
      await screen.findByRole('link', { name: /Apartment/ }),
    ).toHaveAttribute('href', '/savings');
  });
});

// UC-4.4 — one control, and every figure on the screen answers the same way.
describe('MainPage and the assistant', () => {
  // UC-8.5 — the figures are the app; the assistant is how you ask about them.
  it('leaves every figure working when the assistant is switched off', async () => {
    respondWith(dashboard(), { assistantAvailable: false });
    renderPage();

    expect(
      await screen.findByText(/fica livre depois das alocações/),
    ).toHaveTextContent('R$ 9.110,00');
    expect(screen.getByText('Total de saídas')).toBeInTheDocument();

    // Switched off is a state, not a breakage: the rail opens and says so.
    await userEvent.click(screen.getByRole('button', { name: 'Assistente' }));

    expect(screen.getByText(/O assistente está desligado/)).toBeVisible();
    expect(
      screen.queryByLabelText('Pergunte sobre o seu dinheiro'),
    ).not.toBeInTheDocument();
  });
});

// UC-3.3: cycle navigation is global, and this screen used to ignore it —
// the control was rendered in the header and did nothing at all.
describe('MainPage follows the selected cycle', () => {
  it('opens on the next cycle when none is selected', async () => {
    renderPage();

    expect(
      await screen.findByText(/No ciclo Setembro de 2026/),
    ).toBeInTheDocument();
  });

  it('describes the cycle the nav has selected', async () => {
    respondWith(
      dashboard({
        headline: { ...dashboard().headline, cycleLabel: 'Agosto de 2026' },
      }),
    );

    renderPage('/?cycle=2026-08');

    expect(
      await screen.findByText(/No ciclo Agosto de 2026/),
    ).toBeInTheDocument();
  });

  // UC-3.1 — the chain strip moved here when the Ledger screen went.
  it('carries the calculation chain for the cycle on screen', async () => {
    renderPage('/?cycle=2026-08');

    expect(
      await screen.findByText('disponível para alocar'),
    ).toBeInTheDocument();
    expect(screen.getByText('abertura do próximo ciclo')).toBeInTheDocument();
  });

  it('does not call a past cycle the next one', async () => {
    renderPage('/?cycle=2026-08');

    await screen.findByText(/No ciclo Setembro de 2026/);

    expect(screen.queryByText('Próximo ciclo')).not.toBeInTheDocument();
  });

  /**
   * Settling invalidates by the `['dashboard']` prefix, so the key the screen
   * actually reads under must sit beneath it. Putting the month in the key
   * without keeping that prefix is what silently stopped every settle from
   * refreshing the figures: the request went out, the cache never moved.
   */
  it('shows the new figures after settling, not the stale ones', async () => {
    let settled = false;
    const due = upcoming({
      description: 'Renovation Progress',
      dueDate: '2026-09-24',
      amount: -235_000,
    });

    stubApi({
      '/api/dashboard': () =>
        dashboard({
          headline: {
            ...dashboard().headline,
            free: settled ? 1_000_000 : 355_600,
          },
          upcoming: settled ? [] : [due],
        }),
      '/api/cycles': window_(),
      '/api/cycles/2026-09': ({ search }) =>
        cycle(
          '2026-09',
          (search.get('estimates') ?? 'included') as EstimateMode,
        ),
      '/api/cycles/2026-09/entries/e1/settle': ({ method }) => {
        if (method === 'POST') settled = true;
        return new Response(null, { status: 204 });
      },
    });

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Pagar' }));

    // The freed-up figure is the visible proof the cache was invalidated and
    // refetched, not just that a request went out.
    expect(await screen.findByText('R$ 10.000,00')).toBeInTheDocument();
  });
});

// UC-3.8 — offered once the cycle's end date has passed, never forced.
describe('MainPage and closing a cycle', () => {
  it('does not offer to close a cycle still running', async () => {
    renderPage();

    await screen.findByText(/fica livre depois das alocações/);

    expect(
      screen.queryByRole('button', { name: 'Fechar o ciclo' }),
    ).not.toBeInTheDocument();
  });

  it('offers to close a cycle whose end has passed, with what is blocking it', async () => {
    respondWith(dashboard({ today: '2026-09-30' }), {
      cycleFor: (month, estimates) =>
        cycle(month, estimates, {
          entries: [
            {
              id: 'e1',
              description: 'Electricity',
              kind: 'FIXED',
              dueDate: '2026-09-15',
              planned: -28_000,
              actual: null,
              status: 'PENDING',
              isEstimate: false,
              isOverridden: false,
              variance: null,
              balance: 0,
            },
          ],
        }),
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Fechar o ciclo' }),
    );

    expect(
      within(screen.getByRole('dialog')).getByText(
        /1 lançamento ainda está sem baixa/,
      ),
    ).toBeInTheDocument();
  });
});

const bucket = (overrides: Partial<BucketResponse>): BucketResponse => ({
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
  expectedYieldPercent: null,
  events: [],
  ...overrides,
});

const goal = () => bucket({});

const ongoing = () =>
  bucket({
    id: 'b2',
    name: 'Investments',
    mode: 'ONGOING',
    target: null,
    targetDate: null,
    percentComplete: null,
  });

const archived = () =>
  bucket({ id: 'b3', name: 'Europe Trip', status: 'ARCHIVED' });
