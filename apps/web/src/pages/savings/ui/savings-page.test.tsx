import type {
  AllocationPreviewResponse,
  BucketEventResponse,
  BucketProjectionResponse,
  BucketResponse,
  CycleWindowResponse,
  WealthProjectionResponse,
} from '@fin/contracts';
import { screen, waitFor, within } from '@testing-library/react';
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
      'Por caixinha',
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

    expect(within(buckets).getByText('meta')).toBeInTheDocument();
    expect(buckets).toHaveTextContent('50% de R$ 60.000,00 até 31/12/2027');
    expect(buckets).toHaveTextContent('20% da Sobra Esperada por ciclo');
  });

  it('shows an ongoing bucket as a rate, with nothing to complete', async () => {
    stub({ '/api/buckets': [ongoing()] });
    renderPage();

    const buckets = await screen.findByRole('region', { name: 'Caixinhas' });

    expect(within(buckets).getByText('contínua')).toBeInTheDocument();
    expect(buckets).toHaveTextContent(
      'R$ 1.778,00 por ciclo — sem objetivo a bater',
    );
    expect(within(buckets).queryByRole('progressbar')).not.toBeInTheDocument();
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

  it('offers to adjust the rule, record an event and archive', async () => {
    stub({ '/api/buckets': [bucket({ name: 'Apartment' })] });
    renderPage();

    expect(
      await screen.findByRole('button', {
        name: 'Ajustar a regra de Apartment',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Registrar em Apartment' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Arquivar Apartment' }),
    ).toBeInTheDocument();
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

  // UC-7.3 — an ongoing bucket has no finish line, only a rate.
  it('reads an ongoing bucket in its own terms', async () => {
    stub({ '/api/buckets': [bucket()], '/api/wealth': wealth() });
    renderPage();

    const perBucket = await screen.findByRole('region', {
      name: 'Por caixinha',
    });

    expect(perBucket).toHaveTextContent(
      'Com R$ 1.778,00 por ciclo e 9% ao ano, Investments tem R$ 142,0k em 5 anos e R$ 331,0k em 10. Sem objetivo a bater — a questão é só se o ritmo está certo.',
    );
  });

  it('reads a goal as the month it arrives, against the month it was wanted', async () => {
    stub({
      '/api/buckets': [bucket()],
      '/api/wealth': wealth({
        buckets: [
          projected({
            bucketId: 'apartment',
            name: 'Apartment',
            isGoal: true,
            expectedYieldPercent: 8,
            target: 15_000_000,
            targetDate: '2031-03-31',
            reachesTargetIn: 55,
            isOnTrack: true,
            inFiveYears: null,
            inTenYears: null,
          }),
        ],
      }),
    });
    renderPage();

    const perBucket = await screen.findByRole('region', {
      name: 'Por caixinha',
    });

    expect(perBucket).toHaveTextContent(
      'Com R$ 1.778,00 por ciclo e 8% ao ano, Apartment alcança R$ 150.000,00 em Março de 2031. Objetivo: Março de 2031.',
    );
    expect(within(perBucket).getByText('no prazo')).toBeInTheDocument();
  });

  it('flags a goal that is behind, with the contribution that fixes it', async () => {
    stub({
      '/api/buckets': [bucket()],
      '/api/wealth': wealth({
        buckets: [
          projected({
            bucketId: 'apartment',
            name: 'Apartment',
            isGoal: true,
            target: 15_000_000,
            targetDate: '2031-03-31',
            reachesTargetIn: null,
            isOnTrack: false,
            contributionToCatchUp: 250_000,
            inFiveYears: null,
            inTenYears: null,
          }),
        ],
      }),
    });
    renderPage();

    expect(await screen.findByText('atrasada')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'R$ 2.500,00 por ciclo traria de volta ao prazo',
    );
  });

  // UC-7.1 and UC-7.4 — an assumption, adjustable where it moves the number.
  it('re-projects when a yield assumption is changed inline', async () => {
    stub({ '/api/buckets': [bucket()], '/api/wealth': wealth() });
    renderPage();

    const field = await screen.findByLabelText(
      'Rendimento anual esperado para Investments',
    );

    expect(
      screen.getByText(/Uma premissa. Ajustar aqui move a projeção/),
    ).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, '12');

    await waitFor(() => {
      expect(requestedUrls()).toContain(
        '/api/wealth?month=2026-08&yields=investments%3A12',
      );
    });
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

function requestedUrls(): string[] {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const calls = fetchMock.mock.calls as unknown as [string][];

  return calls.map((call) => call[0]);
}
