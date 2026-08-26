import { describe, expect, it } from 'vitest';

import { Allocation, Bucket } from '../goals/bucket.js';
import { noHolidays } from '../ports/holiday-calendar.js';
import { LocalDate } from '../shared/local-date.js';
import { Money } from '../shared/money.js';
import { Percentage } from '../shared/percentage.js';
import { SettlementStatus } from '../shared/planned-actual.js';
import { allocateInto } from './allocation-generation.js';
import { CycleRef, PaydayAnchor, ShiftPolicy } from './cycle-ref.js';
import { Cycle, Estimates } from './cycle.js';
import { EntryKind, LedgerEntry } from './ledger-entry.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const ref = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

const entry = (id: string, kind: EntryKind, due: string, amount: number) =>
  LedgerEntry.create({
    id,
    description: id,
    kind,
    dueDate: LocalDate.parse(due),
    planned: reais(amount),
  });

/** Income 10.000, bills 2.000 — an Expected Surplus of 8.000. */
const september = (
  entries = [
    entry('salary', EntryKind.Income, '2026-08-05', 10_000),
    entry('rent', EntryKind.Fixed, '2026-08-10', -2_000),
  ],
) =>
  Cycle.open({
    id: '2026-09',
    ref: ref('2026-09'),
    openingBalance: Money.zero(),
    entries,
  });

const percent = (id: string, name: string, share: number, priority: number) =>
  Bucket.ongoing({
    id,
    name,
    rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(share)),
    priority,
  });

const fixed = (id: string, name: string, amount: number, priority: number) =>
  Bucket.ongoing({
    id,
    name,
    rule: Allocation.fixed(reais(amount)),
    priority,
  });

const allocationsOf = (cycle: Cycle) =>
  cycle.entries.filter((one) => one.kind === EntryKind.Allocation);

describe('allocateInto', () => {
  it('takes each active bucket its share of the expected surplus', () => {
    const filled = allocateInto(september(), [
      percent('reserve', 'Reserva', 20, 1),
      percent('invest', 'Investimentos', 10, 2),
    ]);

    expect(
      allocationsOf(filled).map((one) => [
        one.description,
        one.amount.planned.cents,
      ]),
    ).toEqual([
      ['→ Reserva', -160_000],
      ['→ Investimentos', -80_000],
    ]);
  });

  /** The whole point: the chain's three stages stop being one number. */
  it('makes net surplus differ from expected surplus', () => {
    const filled = allocateInto(september(), [percent('r', 'Reserva', 20, 1)]);
    const chain = filled.chain(Estimates.Included);

    expect(chain.expectedSurplus.cents).toBe(800_000);
    expect(chain.allocations.cents).toBe(160_000);
    expect(chain.netSurplus.cents).toBe(640_000);
  });

  it('dates an allocation at the end of the cycle it comes out of', () => {
    const filled = allocateInto(september(), [percent('r', 'Reserva', 20, 1)]);

    expect(allocationsOf(filled)[0]?.dueDate).toEqual(ref('2026-09').end);
  });

  it('adds nothing the second time it runs', () => {
    const buckets = [percent('r', 'Reserva', 20, 1)];
    const once = allocateInto(september(), buckets);
    const twice = allocateInto(once, buckets);

    expect(allocationsOf(twice)).toHaveLength(1);
  });

  /**
   * UC-6.4 — the rules can ask for more than the cycle holds, and the answer
   * is priority order rather than everybody getting less.
   */
  it('funds in priority order when the money runs short', () => {
    const filled = allocateInto(september(), [
      fixed('first', 'Primeira', 6_000, 1),
      fixed('second', 'Segunda', 6_000, 2),
      fixed('third', 'Terceira', 1_000, 3),
    ]);

    expect(
      allocationsOf(filled).map((one) => [
        one.description,
        one.amount.planned.cents,
      ]),
    ).toEqual([
      ['→ Primeira', -600_000],
      ['→ Segunda', -200_000],
    ]);
  });

  it('allocates nothing when the surplus is negative', () => {
    const overdrawn = september([
      entry('salary', EntryKind.Income, '2026-08-05', 1_000),
      entry('rent', EntryKind.Fixed, '2026-08-10', -3_000),
    ]);

    expect(
      allocationsOf(allocateInto(overdrawn, [percent('r', 'R', 20, 1)])),
    ).toHaveLength(0);
  });

  it('leaves an archived bucket out', () => {
    const filled = allocateInto(september(), [
      percent('r', 'Reserva', 20, 1).archive(),
    ]);

    expect(allocationsOf(filled)).toHaveLength(0);
  });

  /**
   * `ManageBuckets.allocate` writes real entries when the rules are applied,
   * and one may have been settled or overridden for a single cycle (UC-6.5).
   * Nothing derived may overwrite a decision the user made.
   */
  it('leaves an allocation the cycle already holds exactly as it is', () => {
    const held = september([
      entry('salary', EntryKind.Income, '2026-08-05', 10_000),
      entry('rent', EntryKind.Fixed, '2026-08-10', -2_000),
      LedgerEntry.create({
        id: 'alloc-reserve@2026-09',
        description: '→ Reserva',
        kind: EntryKind.Allocation,
        dueDate: ref('2026-09').end,
        planned: reais(-500),
        origin: { kind: 'FROM_ALLOCATION', bucketId: 'reserve' },
      }),
    ]);

    const filled = allocateInto(held, [percent('reserve', 'Reserva', 20, 1)]);

    expect(
      allocationsOf(filled).map((one) => one.amount.planned.cents),
    ).toEqual([-50_000]);
  });

  it('leaves a settled allocation alone', () => {
    const settled = september([
      entry('salary', EntryKind.Income, '2026-08-05', 10_000),
      LedgerEntry.create({
        id: 'alloc-reserve@2026-09',
        description: '→ Reserva',
        kind: EntryKind.Allocation,
        dueDate: ref('2026-09').end,
        planned: reais(-500),
        origin: { kind: 'FROM_ALLOCATION', bucketId: 'reserve' },
      }),
    ]).settleEntry('alloc-reserve@2026-09', reais(-500), SettlementStatus.Paid);

    const filled = allocateInto(settled, [
      percent('reserve', 'Reserva', 20, 1),
    ]);

    expect(allocationsOf(filled)).toHaveLength(1);
    expect(allocationsOf(filled)[0]?.status).toBe(SettlementStatus.Paid);
  });

  /** A closed cycle rejects every mutation, so it is never touched. */
  it('leaves a closed cycle alone', () => {
    const closed = september([
      entry('salary', EntryKind.Income, '2026-08-05', 10_000),
    ]).settleEntry('salary', reais(10_000), SettlementStatus.Received);

    const filled = allocateInto(closed.close(), [percent('r', 'R', 20, 1)]);

    expect(allocationsOf(filled)).toHaveLength(0);
  });
});
