import { describe, expect, it } from 'vitest';

import { Account, AccountType } from '../../domain/budgeting/account.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle, Estimates } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import {
  InMemoryAccountRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import { ListCycles } from './uc-3-3-list-cycles.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const refFor = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);

// 10 Aug 2026 sits inside the August cycle, which runs 5 Aug – 3 Sep.
const clock = FixedClock.at('2026-08-10T12:00:00Z');

const listing = (options: {
  cycles?: Cycle[];
  accounts?: Account[];
  at?: string;
}) =>
  new ListCycles(
    new InMemoryCycleRepository(options.cycles ?? []),
    new InMemorySettingsRepository(anchor),
    new InMemoryAccountRepository(options.accounts ?? []),
    noHolidays,
    options.at === undefined ? clock : FixedClock.at(options.at),
    new InMemoryTemplateRepository(),
  );

const cycleWith = (month: string, reais: number) =>
  Cycle.open({
    id: month,
    ref: refFor(month),
    openingBalance: Money.zero(),
    entries: [
      LedgerEntry.create({
        id: `${month}-income`,
        description: 'Salary',
        kind: EntryKind.Income,
        dueDate: refFor(month).start,
        planned: Money.fromCents(reais * 100),
      }),
    ],
  });

describe('ListCycles.rollingWindow', () => {
  it('holds the current cycle and eleven ahead', async () => {
    const window = await listing({}).rollingWindow();

    expect(window).toHaveLength(12);
    expect(window[0]?.month).toBe('2026-08');
    expect(window[11]?.month).toBe('2027-07');
  });

  it('tags exactly one cycle as current', async () => {
    const window = await listing({}).rollingWindow();

    expect(window.filter((c) => c.position === 'current')).toHaveLength(1);
    expect(window[0]?.position).toBe('current');
  });

  it('tags the one after it as next, and the rest as projected', async () => {
    const window = await listing({}).rollingWindow();

    expect(window[1]?.position).toBe('next');
    expect(window.slice(2).every((c) => c.position === 'projected')).toBe(true);
  });

  // The window rolls with the clock, not with the calendar month.
  it('moves the current cycle forward once payday has passed', async () => {
    const window = await listing({
      at: '2026-09-06T12:00:00Z',
    }).rollingWindow();

    expect(window[0]?.month).toBe('2026-09');
  });

  // 4 Sep is still inside the August cycle: the boundary is payday, not the 1st.
  it('still calls August current on the day before September opens', async () => {
    const window = await listing({
      at: '2026-09-03T12:00:00Z',
    }).rollingWindow();

    expect(window[0]?.month).toBe('2026-08');
  });

  it('states each cycle bounds rather than a bare month name', async () => {
    const [august] = await listing({}).rollingWindow();

    expect(august?.label).toBe('August 2026');
    expect(august?.start).toBe('2026-08-05');
    expect(august?.end).toBe('2026-09-03');
  });
});

describe('ListCycles balance chaining', () => {
  it('opens the window on what is actually in the accounts', async () => {
    const window = await listing({
      accounts: [
        Account.open({
          id: 'a',
          name: 'Inter',
          type: AccountType.Checking,
          balance: Money.fromCents(216_000),
        }),
      ],
    }).rollingWindow();

    expect(window[0]?.openingBalanceCents).toBe(216_000);
  });

  it("carries each closing balance into the next cycle's opening", async () => {
    const window = await listing({
      cycles: [cycleWith('2026-08', 1_000), cycleWith('2026-09', 2_000)],
    }).rollingWindow();

    expect(window[0]?.closingBalanceCents).toBe(100_000);
    expect(window[1]?.openingBalanceCents).toBe(100_000);
    expect(window[1]?.closingBalanceCents).toBe(300_000);
  });

  it('chains straight through months nobody has touched', async () => {
    const window = await listing({
      cycles: [cycleWith('2026-08', 1_000)],
    }).rollingWindow();

    expect(window[11]?.openingBalanceCents).toBe(100_000);
    expect(window[11]?.closingBalanceCents).toBe(100_000);
  });

  it('reports which months exist and which are only projected', async () => {
    const window = await listing({
      cycles: [cycleWith('2026-08', 1_000)],
    }).rollingWindow();

    expect(window[0]?.isMaterialised).toBe(true);
    expect(window[1]?.isMaterialised).toBe(false);
  });

  it('persists nothing for a month it merely projects', async () => {
    const repository = new InMemoryCycleRepository([
      cycleWith('2026-08', 1_000),
    ]);
    const useCase = new ListCycles(
      repository,
      new InMemorySettingsRepository(anchor),
      new InMemoryAccountRepository(),
      noHolidays,
      clock,
      new InMemoryTemplateRepository(),
    );

    await useCase.rollingWindow();
    await useCase.rollingWindow();

    expect(repository.saved).toHaveLength(1);
  });

  it('chains the confirmed-only reading separately', async () => {
    const estimated = Cycle.open({
      id: '2026-08',
      ref: refFor('2026-08'),
      openingBalance: Money.zero(),
      entries: [
        LedgerEntry.create({
          id: 'guess',
          description: 'Contractor Costs',
          kind: EntryKind.Fixed,
          dueDate: LocalDate.parse('2026-08-25'),
          planned: Money.fromCents(-150_000),
          isEstimate: true,
        }),
      ],
    });
    const useCase = listing({ cycles: [estimated] });

    const including = await useCase.rollingWindow(Estimates.Included);
    const confirmed = await useCase.rollingWindow(Estimates.Excluded);

    expect(including[1]?.openingBalanceCents).toBe(-150_000);
    expect(confirmed[1]?.openingBalanceCents).toBe(0);
  });
});
