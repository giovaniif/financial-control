import type {
  BucketResponse,
  CycleResponse,
  CycleSummaryResponse,
  DashboardResponse,
  EstimateMode,
} from '@fin/contracts';
import { screen, waitFor, within } from '@testing-library/react';
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
  headline: {
    cycleMonth: '2026-09',
    cycleLabel: 'September 2026',
    range: '4 Sep – 4 Oct',
    incoming: 1_800_000,
    outgoing: 911_000,
    free: 355_600,
    lowestPoint: 355_600,
    lowestPointDate: '2026-09-28',
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
  alerts: [],
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
    lowWaterMark: {
      balance: including ? 355_600 : 505_600,
      date: '2026-09-28',
      description: 'Contractor Costs',
    },
    firstNegativeDate: null,
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
    cycles?: CycleSummaryResponse[];
    cycleFor?: (month: string, estimates: EstimateMode) => CycleResponse;
    assistantAvailable?: boolean;
  } = {},
) {
  const {
    buckets = [],
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
      cards: 0,
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

/** A window wide enough for the assistant to sit beside the figures. */
function renderWide(entry = '/') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );

  return renderPage(entry);
}

/** The chain strip names the same figures, so the tiles are read on their own. */
const tiles = () =>
  within(screen.getByRole('region', { name: 'Headline figures' }));

const upcoming = (overrides = {}) => ({
  id: 'e1',
  cycleMonth: '2026-09',
  description: 'Electricity',
  dueDate: '2026-09-15',
  amount: -28_000,
  isEstimate: false,
  isOverdue: false,
  daysLate: 0,
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

    const headline = await screen.findByText(/stays free after allocations/);

    expect(headline).toHaveTextContent(
      'In the September 2026 cycle you’ll receive',
    );
  });

  it('states the amounts in the headline', async () => {
    renderPage();

    const headline = await screen.findByText(/stays free after allocations/);

    // The same figures also appear as KPI tiles, so this scopes to the sentence.
    expect(headline).toHaveTextContent('R$ 18.000,00');
    expect(headline).toHaveTextContent('R$ 9.110,00');
    expect(headline).toHaveTextContent('R$ 3.556,00');
  });

  // Never let a guess masquerade as a fact.
  it('shows the closing balance without the estimates too', async () => {
    renderPage();

    expect(
      await screen.findByText('Without the estimates'),
    ).toBeInTheDocument();
    expect(screen.getByText('R$ 5.056,00')).toBeInTheDocument();
  });

  it('shows the four KPIs, each with the note saying what it is made of', async () => {
    renderPage();

    await screen.findByText('Lowest point in cycle');

    expect(
      tiles().getAllByText(
        /^(Total Outcome|Expected Surplus|Net Surplus|Lowest point in cycle)$/,
      ),
    ).toHaveLength(4);
    expect(
      tiles().getByText('free cash after allocations'),
    ).toBeInTheDocument();
  });

  it('reports cycle progress against spend', async () => {
    renderPage();

    expect(await screen.findByText('Day 6 of 30')).toBeInTheDocument();
    expect(screen.getByText('Spent against planned')).toBeInTheDocument();
  });

  it('says when there is nothing due', async () => {
    renderPage();

    expect(await screen.findByText('Nothing due')).toBeInTheDocument();
  });

  it('announces a critical alert to a screen reader', async () => {
    respondWith(
      dashboard({
        alerts: [
          {
            severity: 'CRITICAL',
            title: 'Projected negative balance on 2026-09-28',
            body: 'September 2026 runs to -R$ 2.013,22.',
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Projected negative balance',
    );
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
    expect(screen.getByText('4 days late')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument();
  });

  /**
   * UC-3.5 — with the Ledger screen gone this is the only place an entry is
   * settled by hand, so the two-click path has to live here as well as the
   * one-click one.
   */
  it('offers to settle at an amount other than the planned one', async () => {
    respondWith(dashboard({ upcoming: [upcoming()] }));

    renderPage();

    expect(
      await screen.findByRole('button', {
        name: 'Settle at a different amount',
      }),
    ).toBeInTheDocument();
  });

  it('offers to confirm money coming in, not settle it', async () => {
    respondWith(
      dashboard({
        upcoming: [upcoming({ description: 'Salary', amount: 1_800_000 })],
      }),
    );

    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Confirm' }),
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

    expect(await screen.findByText('~estimate')).toBeInTheDocument();
  });

  // UC-4.1 — a cycle with nothing scheduled has no lowest point to name.
  it('says so when there is no lowest point', async () => {
    respondWith(
      dashboard({
        headline: {
          ...dashboard().headline,
          lowestPoint: null,
          lowestPointDate: null,
        },
      }),
    );

    renderPage();

    expect(await screen.findByText('nothing scheduled')).toBeInTheDocument();
  });

  it('shows no bucket chips before there are any buckets', async () => {
    renderPage();

    await screen.findByText('Lowest point in cycle');

    expect(screen.queryByText('Buckets')).not.toBeInTheDocument();
  });

  it('shows a goal bucket as progress toward its target', async () => {
    respondWith(dashboard(), { buckets: [goal(), archived()] });

    renderPage();

    expect(await screen.findByText('Apartment')).toBeInTheDocument();
    expect(screen.getByText(/24% of/)).toBeInTheDocument();
    // Archived buckets are out of the picture entirely.
    expect(screen.queryByText('Europe Trip')).not.toBeInTheDocument();
  });

  // Reporting progress toward a target that does not exist is the bug UC-6.1
  // exists to prevent.
  it('shows an ongoing bucket as having nothing to complete', async () => {
    respondWith(dashboard(), { buckets: [ongoing()] });

    renderPage();

    expect(await screen.findByText('Investments')).toBeInTheDocument();
    expect(screen.getByText('ongoing — no target to hit')).toBeInTheDocument();
    expect(screen.queryByText(/% of/)).not.toBeInTheDocument();
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
describe('MainPage answers the estimates toggle', () => {
  const switchOff = async () =>
    userEvent.click(
      screen.getByRole('button', { name: 'Including estimates' }),
    );

  it('restates the headline from the confirmed figures', async () => {
    respondWith(dashboard({ upcoming: [upcoming({ isEstimate: true })] }));
    renderPage();

    expect(
      await screen.findByText(/stays free after allocations/),
    ).toHaveTextContent('R$ 9.110,00');

    await switchOff();

    // The reading is refetched rather than re-derived on the client, so the
    // sentence arrives with the answer instead of changing in place.
    await waitFor(() => {
      const sentence = screen.getByText(/stays free after allocations/);
      expect(sentence).toHaveTextContent('R$ 7.610,00');
      expect(sentence).toHaveTextContent('R$ 5.056,00');
    });
  });

  it('restates the KPI tiles and the chain at the same moment', async () => {
    respondWith(dashboard());
    renderPage();

    await screen.findByText('Lowest point in cycle');
    expect(tiles().getByText('R$ 9.110,00')).toBeInTheDocument();

    await switchOff();

    expect(await tiles().findByText('R$ 7.610,00')).toBeInTheDocument();
    // The chain strip closes at the confirmed figure too.
    expect(
      within(
        screen.getByRole('region', { name: 'Calculation chain' }),
      ).getByText('R$ 6.056,00'),
    ).toBeInTheDocument();
  });

  it('drops the unconfirmed placeholders from what is due', async () => {
    respondWith(
      dashboard({
        upcoming: [
          upcoming({ description: 'Contractor Costs', isEstimate: true }),
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Contractor Costs')).toBeInTheDocument();

    await switchOff();

    expect(screen.queryByText('Contractor Costs')).not.toBeInTheDocument();
  });
});

// UC-8 — the assistant is part of the screen, not a widget in the corner.
describe('MainPage and the assistant', () => {
  const alerts = [
    {
      severity: 'CRITICAL' as const,
      title: 'Projected negative balance on 2026-09-28',
      body: 'September 2026 runs to -R$ 2.013,22.',
    },
  ];

  it('sits beside the figures on a wide window', async () => {
    renderWide();

    await screen.findByText('Lowest point in cycle');

    expect(
      screen.getByRole('log', { name: 'Assistant conversation' }),
    ).toBeInTheDocument();
  });

  /**
   * At a narrow width the chat and the figures would fight for the same
   * column, so the chat folds down to one control until it is wanted.
   */
  it('folds away at a narrow width rather than crowding the figures', async () => {
    renderPage();

    await screen.findByText('Lowest point in cycle');

    expect(
      screen.queryByRole('log', { name: 'Assistant conversation' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ask Claude' }));

    expect(
      screen.getByRole('log', { name: 'Assistant conversation' }),
    ).toBeInTheDocument();
  });

  // UC-4.7 with UC-8: an alert is the thing most worth asking about.
  it('makes an alert answerable in a click', async () => {
    respondWith(dashboard({ alerts }));
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ask about this alert' }),
    );

    expect(screen.getByLabelText('Ask about your money')).toHaveValue(
      'About “Projected negative balance on 2026-09-28”: September 2026 runs ' +
        'to -R$ 2.013,22. Why is that, and what would change it?',
    );
    // The question is offered, never sent on the user's behalf.
    expect(
      screen.getByRole('log', { name: 'Assistant conversation' }),
    ).toHaveTextContent('Nothing asked yet');
  });

  // UC-8.5 — the figures are the app; the assistant is how you ask about them.
  it('leaves every figure working when the assistant is switched off', async () => {
    respondWith(dashboard({ alerts }), { assistantAvailable: false });
    renderWide();

    expect(
      await screen.findByText(/stays free after allocations/),
    ).toHaveTextContent('R$ 9.110,00');
    expect(tiles().getByText('Total Outcome')).toBeInTheDocument();
    expect(
      screen.getByText(/The assistant is switched off/),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Ask about your money'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ask about this alert' }),
    ).not.toBeInTheDocument();
  });
});

// UC-3.3: cycle navigation is global, and this screen used to ignore it —
// the control was rendered in the header and did nothing at all.
describe('MainPage follows the selected cycle', () => {
  it('opens on the next cycle when none is selected', async () => {
    renderPage();

    expect(
      await screen.findByText(/In the September 2026 cycle/),
    ).toBeInTheDocument();
  });

  it('describes the cycle the nav has selected', async () => {
    respondWith(
      dashboard({
        headline: { ...dashboard().headline, cycleLabel: 'August 2026' },
      }),
    );

    renderPage('/?cycle=2026-08');

    expect(
      await screen.findByText(/In the August 2026 cycle/),
    ).toBeInTheDocument();
  });

  // UC-3.1 — the chain strip moved here when the Ledger screen went.
  it('carries the calculation chain for the cycle on screen', async () => {
    renderPage('/?cycle=2026-08');

    expect(
      await screen.findByText('available to allocate'),
    ).toBeInTheDocument();
    expect(screen.getByText("next cycle's opening")).toBeInTheDocument();
  });

  it('does not call a past cycle the next one', async () => {
    renderPage('/?cycle=2026-08');

    await screen.findByText(/In the September 2026 cycle/);

    expect(screen.queryByText('Next cycle')).not.toBeInTheDocument();
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

    await userEvent.click(
      await screen.findByRole('button', { name: 'Settle' }),
    );

    // The freed-up figure is the visible proof the cache was invalidated and
    // refetched, not just that a request went out.
    expect(await screen.findByText('R$ 10.000,00')).toBeInTheDocument();
  });
});

// UC-3.8 — offered once the cycle's end date has passed, never forced.
describe('MainPage and closing a cycle', () => {
  it('does not offer to close a cycle still running', async () => {
    renderPage();

    await screen.findByText('Lowest point in cycle');

    expect(
      screen.queryByRole('button', { name: 'Close the cycle' }),
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
      await screen.findByRole('button', { name: 'Close the cycle' }),
    );

    expect(
      within(screen.getByRole('dialog')).getByText(
        /1 entry is still unsettled/,
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
