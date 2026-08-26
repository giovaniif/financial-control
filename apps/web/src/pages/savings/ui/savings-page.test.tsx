import type {
  AllocationPreviewResponse,
  BucketEventResponse,
  BucketProjectionResponse,
  BucketResponse,
  CycleWindowResponse,
  WealthProjectionResponse,
} from '@fin/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, stubApi } from '@/shared/testing';

import { SavingsPage } from './savings-page.js';

const window_: CycleWindowResponse = {
  estimates: 'included',
  cycles: [
    {
      month: '2026-08',
      label: 'Agosto de 2026',
      start: '2026-07-03',
      end: '2026-08-04',
      status: 'OPEN',
      position: 'current',
      openingBalance: 0,
      closingBalance: 0,
      netSurplus: 0,
      isMaterialised: true,
    },
  ],
};

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

const ongoing = (overrides: Partial<BucketResponse> = {}): BucketResponse =>
  bucket({
    id: 'investments',
    name: 'Investments',
    mode: 'ONGOING',
    target: null,
    targetDate: null,
    percentComplete: null,
    rule: { kind: 'FIXED', amount: 177_800 },
    ...overrides,
  });

const event = (
  overrides: Partial<BucketEventResponse> = {},
): BucketEventResponse => ({
  id: 'e1',
  kind: 'CONTRIBUTION',
  when: '2026-08',
  amount: 177_800,
  reason: null,
  ruleWouldHaveBeen: null,
  ...overrides,
});

const preview = (
  overrides: Partial<AllocationPreviewResponse> = {},
): AllocationPreviewResponse => ({
  month: '2026-08',
  expectedSurplus: 889_000,
  fundings: [],
  shortfall: 0,
  isOvercommitted: false,
  ...overrides,
});

const projected = (
  overrides: Partial<BucketProjectionResponse> = {},
): BucketProjectionResponse => ({
  bucketId: 'investments',
  name: 'Investments',
  isGoal: false,
  contributionPerCycle: 177_800,
  expectedYieldPercent: 9,
  reachesTargetIn: null,
  target: null,
  targetDate: null,
  isOnTrack: null,
  contributionToCatchUp: null,
  inFiveYears: 14_200_000,
  inTenYears: 33_100_000,
  ...overrides,
});

const wealth = (
  overrides: Partial<WealthProjectionResponse> = {},
): WealthProjectionResponse => ({
  horizons: [5, 10, 20, 30].map((years) => ({
    years,
    total: years * 1_000_000,
    byBucket: [
      {
        bucketId: 'investments',
        name: 'Investments',
        amount: years * 1_000_000,
      },
    ],
  })),
  buckets: [projected()],
  retirement: null,
  ...overrides,
});

type Routes = Parameters<typeof stubApi>[0];

const stub = (routes: Routes) => {
  stubApi({
    '/api/cycles': window_,
    '/api/cycles/2026-08/allocation-preview': preview(),
    ...routes,
  });
};

const renderPage = () =>
  renderWithProviders(
    <RouterProvider
      router={createMemoryRouter([{ path: '/', element: <SavingsPage /> }])}
    />,
  );

const regionNames = () =>
  screen
    .getAllByRole('region')
    .map((section) => section.getAttribute('aria-label'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SavingsPage', () => {
  it('explains the two kinds when there are none', async () => {
    stub({ '/api/buckets': [] });
    renderPage();

    expect(
      await screen.findByText('Nenhuma caixinha ainda'),
    ).toBeInTheDocument();
  });

  /**
   * UC-6 then UC-7: the buckets, what this cycle actually funds, the selected
   * bucket in full, and only then where the rate lands.
   */
  it('orders its sections from the buckets to the decades', async () => {
    stub({ '/api/buckets': [bucket()], '/api/wealth': wealth() });
    renderPage();
    await screen.findByRole('region', { name: 'Patrimônio' });

    expect(regionNames()).toEqual([
      'Caixinhas',
      'Alocação neste ciclo',
      'Previsto x real',
      'Histórico',
      'Patrimônio',
    ]);
  });

  // The detail below the grid is always about one bucket, and which one is
  // the user's choice rather than whichever came back first.
  it('turns the detail below the grid to whichever bucket is picked', async () => {
    stub({ '/api/buckets': [bucket(), ongoing()] });
    renderPage();

    const history = await screen.findByRole('region', { name: 'Histórico' });

    expect(history).toHaveTextContent('Reserve — histórico');

    await userEvent.click(
      screen.getByRole('button', { name: 'Selecionar Investments' }),
    );

    expect(screen.getByRole('region', { name: 'Histórico' })).toHaveTextContent(
      'Investments — histórico',
    );
    expect(
      screen.getByRole('button', { name: 'Selecionar Investments' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

/**
 * UC-6.1 — reporting progress toward a target that does not exist is the
 * specific failure the mode distinction prevents, so the two paths are covered
 * apart from each other.
 */
describe('SavingsPage tells a goal from an ongoing commitment', () => {
  it('shows a goal as progress toward its target', async () => {
    stub({ '/api/buckets': [bucket()] });
    renderPage();

    const buckets = await screen.findByRole('region', { name: 'Caixinhas' });

    // The progress bar and the target say it is a goal; a `meta` badge
    // beside them was a label for what the card already showed.
    expect(within(buckets).getByRole('progressbar')).toBeInTheDocument();
    expect(within(buckets).queryByText('meta')).not.toBeInTheDocument();
    expect(buckets).toHaveTextContent('50% de R$ 60.000,00 até 31/12/2027');
    expect(buckets).toHaveTextContent('20% da Sobra Esperada por ciclo');
  });

  it('shows an ongoing bucket as a rate, with nothing to complete', async () => {
    stub({ '/api/buckets': [ongoing()] });
    renderPage();

    const buckets = await screen.findByRole('region', { name: 'Caixinhas' });

    expect(buckets).toHaveTextContent(
      'R$ 1.778,00 por ciclo — sem objetivo a bater',
    );
    expect(within(buckets).queryByText('contínua')).not.toBeInTheDocument();
    expect(within(buckets).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  /** The one state no other part of the card states. */
  it('still says when a caixinha is archived', async () => {
    stub({ '/api/buckets': [bucket({ status: 'ARCHIVED' })] });
    renderPage();

    const buckets = await screen.findByRole('region', { name: 'Caixinhas' });

    expect(within(buckets).getByText('arquivada')).toBeInTheDocument();
  });

  // The half that is missing is never invented: a goal without a target is
  // read as having none, not as being 0% of the way toward nothing.
  it('never reports progress for a goal whose target is missing', async () => {
    stub({
      '/api/buckets': [
        bucket({ target: null, targetDate: null, percentComplete: null }),
      ],
    });
    renderPage();

    const buckets = await screen.findByRole('region', { name: 'Caixinhas' });

    expect(within(buckets).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(buckets).toHaveTextContent('sem objetivo a bater');
  });

  it('keeps growth from saving apart from growth from returns', async () => {
    stub({
      '/api/buckets': [bucket({ contributed: 2_900_000, yielded: 100_000 })],
    });
    renderPage();

    const buckets = await screen.findByRole('region', { name: 'Caixinhas' });

    expect(buckets).toHaveTextContent('aportado R$ 29.000,00');
    expect(buckets).toHaveTextContent('rendeu R$ 1.000,00');
  });

  it('dims an archived bucket but keeps it readable', async () => {
    stub({ '/api/buckets': [bucket({ status: 'ARCHIVED' })] });
    renderPage();

    expect(await screen.findByText('arquivada')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Arquivar Reserve' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The actions live on the caixinha they act on, so the trigger names it —
   * five identical "Ações" would put the subject back in selection state,
   * which is what moving them here removed.
   */
  it('keeps a caixinha\u2019s actions on the caixinha', async () => {
    stub({ '/api/buckets': [bucket({ name: 'Apartment' })] });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Apartment' }),
    );

    expect(
      screen.getByRole('button', { name: 'Ajustar a regra de Apartment' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Registrar em Apartment' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Arquivar Apartment' }),
    ).toBeInTheDocument();
  });

  it('keeps them out of the way until they are asked for', async () => {
    stub({ '/api/buckets': [bucket({ name: 'Apartment' })] });
    renderPage();

    await screen.findByRole('button', { name: 'Ações de Apartment' });

    expect(
      screen.queryByRole('button', { name: 'Arquivar Apartment' }),
    ).not.toBeInTheDocument();
  });

  it('closes on Escape and gives the trigger back its focus', async () => {
    stub({ '/api/buckets': [bucket({ name: 'Apartment' })] });
    renderPage();

    const trigger = await screen.findByRole('button', {
      name: 'Ações de Apartment',
    });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(
      screen.queryByRole('button', { name: 'Arquivar Apartment' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  /** Two caixinhas, and the action belongs to the one it was opened from. */
  it('opens the actions of the caixinha they sit on', async () => {
    stub({ '/api/buckets': [bucket({ name: 'Apartment' }), ongoing()] });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Investments' }),
    );

    expect(
      screen.getByRole('button', { name: 'Arquivar Investments' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Arquivar Apartment' }),
    ).not.toBeInTheDocument();
  });
});

/**
 * UC-6.7 — the spreadsheet overwrote its own running total whenever reality
 * drifted, and could not tell a deposit from accrued interest.
 */
describe('SavingsPage reads the event log', () => {
  const everyKind = [
    event({ id: 'c', kind: 'CONTRIBUTION', when: '2026-08', amount: 177_800 }),
    event({
      id: 'o',
      kind: 'OVERRIDE',
      when: '2026-09',
      amount: 100_000,
      ruleWouldHaveBeen: 177_800,
    }),
    event({ id: 'y', kind: 'YIELD', when: '2026-09-30', amount: 12_500 }),
    event({
      id: 'k',
      kind: 'CORRECTION',
      when: '2026-10-01',
      amount: 845_020,
      reason: 'statement differed after fees',
    }),
    event({
      id: 'w',
      kind: 'WITHDRAWAL',
      when: '2026-10-05',
      amount: 50_000,
      reason: 'paid the deposit',
    }),
  ];

  it('tells the five kinds apart', async () => {
    stub({ '/api/buckets': [bucket({ events: everyKind })] });
    renderPage();

    const history = await screen.findByRole('region', { name: 'Histórico' });

    for (const kind of [
      'aporte',
      'ajuste',
      'rendimento',
      'correção',
      'resgate',
    ]) {
      expect(within(history).getByText(kind)).toBeInTheDocument();
    }
  });

  it('never lets a yield read as a deposit', async () => {
    stub({ '/api/buckets': [bucket({ events: everyKind })] });
    renderPage();

    const history = await screen.findByRole('region', { name: 'Histórico' });

    expect(history).toHaveTextContent(
      'crescimento por rendimento, não um aporte',
    );
    expect(history).toHaveTextContent('a regra aplicada em Agosto de 2026');
  });

  it('says what the rule would have contributed on an override', async () => {
    stub({ '/api/buckets': [bucket({ events: everyKind })] });
    renderPage();

    const history = await screen.findByRole('region', { name: 'Histórico' });

    expect(history).toHaveTextContent('a regra diria R$ 1.778,00');
  });

  it('carries the reason a correction and a withdrawal were made', async () => {
    stub({ '/api/buckets': [bucket({ events: everyKind })] });
    renderPage();

    const history = await screen.findByRole('region', { name: 'Histórico' });

    expect(history).toHaveTextContent('statement differed after fees');
    expect(history).toHaveTextContent('paid the deposit');
  });

  it('says nothing has moved when the log is empty', async () => {
    stub({ '/api/buckets': [bucket()] });
    renderPage();

    expect(await screen.findByText('Nada se moveu ainda')).toBeInTheDocument();
  });

  // UC-6.6 — the gap between what the rules said and what is there.
  it('compares what the rules said against what is actually there', async () => {
    stub({
      '/api/buckets': [
        bucket({
          balance: 300_000,
          events: [
            event({ id: 'c', amount: 177_800 }),
            event({
              id: 'o',
              kind: 'OVERRIDE',
              amount: 50_000,
              ruleWouldHaveBeen: 177_800,
            }),
            event({
              id: 'y',
              kind: 'YIELD',
              when: '2026-09-30',
              amount: 5_000,
            }),
          ],
        }),
      ],
    });
    renderPage();

    const planned = await screen.findByRole('region', {
      name: 'Previsto x real',
    });

    expect(planned).toHaveTextContent('R$ 3.556,00');
    expect(planned).toHaveTextContent('R$ 3.000,00');
    expect(planned).toHaveTextContent(
      'R$ 556,00 atrás do que as regras diziam',
    );
  });
});

/** UC-6.3 and UC-6.4 — who is funded, in what order, and out of what. */
describe('SavingsPage warns when the rules run past the money', () => {
  it('shows what the priority order funds this cycle', async () => {
    stub({
      '/api/buckets': [bucket()],
      '/api/cycles/2026-08/allocation-preview': preview({
        fundings: [
          {
            bucketId: 'reserve',
            name: 'Reserve',
            requested: 177_800,
            funded: 177_800,
            isFullyFunded: true,
          },
        ],
      }),
    });
    renderPage();

    const allocation = await screen.findByRole('region', {
      name: 'Alocação neste ciclo',
    });

    expect(allocation).toHaveTextContent(
      'Agosto de 2026 tem R$ 8.890,00 de Sobra Esperada',
    );
    expect(allocation).toHaveTextContent('#1 de 1');
    expect(allocation).toHaveTextContent('Reserve pede R$ 1.778,00');
  });

  it('names the cycle, the shortfall and who the order actually funds', async () => {
    stub({
      '/api/buckets': [bucket()],
      '/api/cycles/2026-08/allocation-preview': preview({
        isOvercommitted: true,
        shortfall: 212_000,
        fundings: [
          {
            bucketId: 'reserve',
            name: 'Reserve',
            requested: 500_000,
            funded: 288_000,
            isFullyFunded: false,
          },
          {
            bucketId: 'investments',
            name: 'Investments',
            requested: 212_000,
            funded: 0,
            isFullyFunded: false,
          },
        ],
      }),
    });
    renderPage();

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent(
      'Falta R$ 2.120,00 para cobrir as regras em Agosto de 2026',
    );
    expect(alert).toHaveTextContent('Reserve recebe R$ 2.880,00');
    expect(alert).toHaveTextContent('Investments não recebe nada');
  });

  // A negative Expected Surplus is said out loud, never turned into a
  // negative contribution.
  it('says plainly when there is nothing to allocate from', async () => {
    stub({
      '/api/buckets': [bucket()],
      '/api/cycles/2026-08/allocation-preview': preview({
        expectedSurplus: -120_000,
        isOvercommitted: true,
        shortfall: 120_000,
      }),
    });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Agosto de 2026 não tem Sobra Esperada para alocar. Nada é aportado',
    );
  });
});

/** UC-7 — where the rate lands, beneath the buckets that feed it. */
describe('SavingsPage projects what the buckets grow into', () => {
  it('stacks net worth at five, ten, twenty and thirty years', async () => {
    stub({ '/api/buckets': [bucket()], '/api/wealth': wealth() });
    renderPage();

    const bars = await screen.findByRole('region', { name: 'Patrimônio' });

    for (const years of ['5 anos', '10 anos', '20 anos', '30 anos']) {
      expect(within(bars).getByText(years)).toBeInTheDocument();
    }
    expect(bars).toHaveTextContent('premissas, não fatos');
  });

  /**
   * The per-bucket sentences and their inline yields were removed: three
   * repetitions of the same clause under bars that already say where the
   * rate lands. The bars and the retirement figure carry UC-7 on their own.
   */
  it('leaves the projection to the bars, with no per-bucket restatement', async () => {
    stub({ '/api/buckets': [bucket()], '/api/wealth': wealth() });
    renderPage();

    await screen.findByRole('region', { name: 'Patrimônio' });

    expect(
      screen.queryByRole('region', { name: 'Por caixinha' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Rendimento anual esperado para Investments'),
    ).not.toBeInTheDocument();
  });

  // Retirement is the one figure measured in monthly income, not in a lump sum.
  it('states retirement as the monthly income it supports', async () => {
    stub({
      '/api/buckets': [bucket()],
      '/api/wealth': wealth({
        retirement: {
          bucketId: 'retirement',
          name: 'Retirement',
          balanceAtHorizon: 30_000_000,
          sustainableMonthlyIncome: 100_000,
        },
      }),
    });
    renderPage();

    const retirement = await screen.findByRole('region', {
      name: 'Aposentadoria',
    });

    expect(retirement).toHaveTextContent('R$ 1.000,00 por mês');
    expect(retirement).toHaveTextContent(
      'Uma premissa, como todo rendimento aqui',
    );
  });
});

/**
 * The cards are peers being compared, so they sit in one row that scrolls
 * rather than a grid the bucket count reshapes. jsdom has no layout, so what
 * is asserted is what would actually break: every bucket renders, and the
 * strip past the edge is reachable without a trackpad gesture.
 */
describe('the caixinha strip', () => {
  it('renders every bucket in one focusable row', async () => {
    stub({ '/api/buckets': [bucket(), ongoing()] });
    renderPage();

    const strip = await screen.findByRole('group', {
      name: 'Suas caixinhas',
    });

    expect(strip).toHaveAttribute('tabindex', '0');
    expect(
      within(strip).getAllByRole('button', { name: /^Selecionar / }),
    ).toHaveLength(2);
  });
});

/**
 * UC-6.1 — a bucket the setup made ongoing could never become a goal, so its
 * progress and completion date were unreachable. The mode is never chosen
 * directly: it follows the target.
 */
describe('SavingsPage sets a goal on a bucket that exists', () => {
  it('offers a goal to an ongoing caixinha', async () => {
    stub({ '/api/buckets': [ongoing()] });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Investments' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Definir uma meta para/ }),
    );

    expect(screen.getByText(/Meta de/)).toBeInTheDocument();
    expect(screen.getByLabelText('Quanto quer juntar')).toHaveValue('');
  });

  it('refuses a goal with no date', async () => {
    stub({ '/api/buckets': [ongoing()] });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Investments' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Definir uma meta para/ }),
    );
    await userEvent.type(screen.getByLabelText('Quanto quer juntar'), '60000');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));

    expect(screen.getByRole('alert')).toHaveTextContent('precisa de uma data');
  });

  it('sends the target, and never the mode', async () => {
    stub({ '/api/buckets': [ongoing()] });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ações de Investments' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Definir uma meta para/ }),
    );
    // The mask reads digits as cents, as every money field here does.
    await userEvent.type(
      screen.getByLabelText('Quanto quer juntar'),
      '6000000',
    );
    await userEvent.type(screen.getByLabelText('Até quando'), '2028-01-05');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));

    const mock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const calls = mock.mock.calls as unknown as [string, RequestInit?][];
    const patch = calls.find(
      (call) => call[1]?.method === 'PATCH' && call[0].includes('/buckets/'),
    );
    const sent = patch?.[1]?.body;
    const body = JSON.parse(typeof sent === 'string' ? sent : '{}') as Record<
      string,
      unknown
    >;

    expect(body['target']).toEqual({ amount: 6_000_000, date: '2028-01-05' });
    expect(body).not.toHaveProperty('mode');
  });
});
