import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import { EntryKind, LedgerEntry } from '../../domain/budgeting/ledger-entry.js';
import { Direction } from '../../domain/budgeting/recurring-template.js';
import { Allocation, Bucket } from '../../domain/goals/bucket.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import { Principal } from '../../domain/shared/principal.js';
import { ConfigurePaydayAnchor } from '../budgeting/uc-1-1-configure-payday-anchor.js';
import {
  EditScope,
  ManageTemplates,
} from '../budgeting/uc-2-manage-templates.js';
import {
  CycleNotFound,
  LedgerActions,
} from '../budgeting/uc-3-ledger-actions.js';
import { ManageBuckets } from '../goals/uc-6-manage-buckets.js';
import {
  FakeProposalStore,
  InMemoryBucketRepository,
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
  SequentialIdSource,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';

import type { ProposedChange } from './proposed-change.js';
import { summarise, UnknownProposal } from './proposed-change.js';
import {
  ApplyProposal,
  ProposalAlreadyApplied,
  ProposalMismatch,
  ProposalNotFound,
  ProposalNotYours,
} from './uc-8-apply-proposal.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const ref = (month: string) => CycleRef.forMonth(month, anchor, noHolidays);
const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

/** 10 Aug 2026 sits in the September cycle, so October is the next one. */
const clock = FixedClock.at('2026-08-10T12:00:00Z');

const entry = (id: string, kind: EntryKind, due: string, amount: number) =>
  LedgerEntry.create({
    id,
    description: id,
    kind,
    dueDate: LocalDate.parse(due),
    planned: reais(amount),
  });

const wire = () => {
  const cycles = new InMemoryCycleRepository([
    Cycle.open({
      id: '2026-10',
      ref: ref('2026-10'),
      openingBalance: Money.zero(),
      entries: [
        entry('salary-1', EntryKind.Income, '2026-09-04', 18_000),
        entry('rent-1', EntryKind.Fixed, '2026-09-10', -7_610),
      ],
    }),
  ]);
  const templates = new InMemoryTemplateRepository();
  const buckets = new InMemoryBucketRepository([
    Bucket.goal({
      id: 'reserve',
      name: 'Reserve',
      target: { amount: reais(60_000), date: LocalDate.parse('2028-01-05') },
      rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
      priority: 1,
    }),
  ]);
  const settings = new InMemorySettingsRepository(anchor);
  const proposals = new FakeProposalStore<ProposedChange>();
  const ids = new SequentialIdSource('made');
  const newId = () => ids.next();

  const apply = new ApplyProposal(
    proposals,
    new LedgerActions(cycles, settings, noHolidays, newId),
    new ManageTemplates(templates, cycles, settings, noHolidays, clock, newId),
    new ConfigurePaydayAnchor(settings, cycles, noHolidays, clock),
    new ManageBuckets(buckets, cycles, settings, noHolidays, newId),
    clock,
  );

  /** A proposal the user has been shown, and the confirmation it produced. */
  const shown = async (
    change: ProposedChange,
    principal = Principal.sole(),
  ) => {
    const summary = summarise(change);
    await proposals.save({
      id: 'proposal-1',
      principal,
      change,
      summary,
      proposedAt: clock.now(),
      appliedAt: undefined,
    });

    return { proposalId: 'proposal-1', summary };
  };

  return {
    apply,
    shown,
    cycles,
    templates,
    buckets,
    settings,
    proposals,
  };
};

const october = async (cycles: InMemoryCycleRepository) => {
  const cycle = await cycles.findByMonth(ref('2026-10'));
  if (cycle === undefined) throw new Error('The October cycle is missing.');
  return cycle;
};

const me = Principal.sole();

describe('ApplyProposal — every kind routes into the use case that owns it', () => {
  it('settles an entry (UC-3.5)', async () => {
    const { apply, shown, cycles } = wire();
    const confirmation = await shown({
      kind: 'SETTLE_ENTRY',
      month: '2026-10',
      entryId: 'rent-1',
      status: SettlementStatus.Paid,
      actual: reais(-7_650),
    });

    const applied = await apply.confirm(me, confirmation);

    const settled = (await october(cycles)).entries.find(
      (candidate) => candidate.id === 'rent-1',
    );
    expect(settled?.status).toBe(SettlementStatus.Paid);
    expect(settled?.amount.actual?.cents).toBe(-765_000);
    expect(applied.kind).toBe('SETTLE_ENTRY');
    expect(applied.summary).toBe(confirmation.summary);
  });

  it('settles at the planned amount when no actual was proposed', async () => {
    const { apply, shown, cycles } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'SETTLE_ENTRY',
        month: '2026-10',
        entryId: 'rent-1',
        status: SettlementStatus.Paid,
        actual: undefined,
      }),
    );

    const settled = (await october(cycles)).entries.find(
      (candidate) => candidate.id === 'rent-1',
    );
    expect(settled?.amount.actual?.cents).toBe(-761_000);
  });

  it('skips an entry through the operation that records no money moving', async () => {
    const { apply, shown, cycles } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'SETTLE_ENTRY',
        month: '2026-10',
        entryId: 'rent-1',
        status: SettlementStatus.Skipped,
        actual: undefined,
      }),
    );

    const skipped = (await october(cycles)).entries.find(
      (candidate) => candidate.id === 'rent-1',
    );
    expect(skipped?.status).toBe(SettlementStatus.Skipped);
  });

  it('adds an ad-hoc entry (UC-3.4)', async () => {
    const { apply, shown, cycles } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'ADD_ENTRY',
        month: '2026-10',
        description: 'Dentist',
        entryKind: EntryKind.Variable,
        dueDate: LocalDate.parse('2026-09-20'),
        amount: reais(-300),
        isEstimate: true,
      }),
    );

    const added = (await october(cycles)).entries.find(
      (candidate) => candidate.description === 'Dentist',
    );
    expect(added?.amount.planned.cents).toBe(-30_000);
    expect(added?.isEstimate).toBe(true);
  });

  it('creates a recurring template (UC-2.1)', async () => {
    const { apply, shown, templates } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'CREATE_TEMPLATE',
        name: 'Health Plan',
        direction: Direction.Out,
        dueDayOfMonth: 8,
        amount: reais(-320),
        startMonth: '2026-10',
        endMonth: undefined,
        isEstimate: false,
      }),
    );

    const [created] = await templates.findAll();
    expect(created?.name).toBe('Health Plan');
    expect(created?.dueDayOfMonth).toBe(8);
    expect(created?.startMonth).toBe('2026-10');
  });

  it('creates a template that starts in the current cycle and ends (UC-2.1)', async () => {
    const { apply, shown, templates } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'CREATE_TEMPLATE',
        name: 'Consulting',
        direction: Direction.In,
        dueDayOfMonth: 20,
        amount: reais(2_000),
        startMonth: undefined,
        endMonth: '2027-03',
        isEstimate: false,
      }),
    );

    const [created] = await templates.findAll();
    expect(created?.startMonth).toBe('2026-09');
    expect(created?.endMonth).toBe('2027-03');
  });

  it('changes a template amount with its scope (UC-2.3)', async () => {
    const { apply, shown, templates } = wire();
    await apply.confirm(
      me,
      await shown({
        kind: 'CREATE_TEMPLATE',
        name: 'Salary',
        direction: Direction.In,
        dueDayOfMonth: 5,
        amount: reais(10_000),
        startMonth: '2026-09',
        endMonth: undefined,
        isEstimate: false,
      }),
    );
    const [template] = await templates.findAll();

    await apply.confirm(
      me,
      await shown({
        kind: 'CHANGE_TEMPLATE_AMOUNT',
        templateId: template?.id ?? '',
        fromMonth: '2026-11',
        amount: reais(18_000),
        scope: EditScope.ThisAndFuture,
      }),
    );

    const [changed] = await templates.findAll();
    expect(changed?.valueSchedule).toEqual([
      { fromMonth: '2026-11', amount: reais(18_000) },
    ]);
  });

  it('moves the payday anchor (UC-1.1)', async () => {
    const { apply, shown, settings } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'CHANGE_PAYDAY_ANCHOR',
        anchorDay: 4,
        shiftPolicy: ShiftPolicy.Following,
      }),
    );

    const saved = await settings.load();
    expect(saved.dayOfMonth).toBe(4);
    expect(saved.shiftPolicy).toBe(ShiftPolicy.Following);
  });

  it('creates a goal bucket (UC-6.1)', async () => {
    const { apply, shown, buckets } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'CREATE_GOAL_BUCKET',
        name: 'Apartment',
        target: reais(150_000),
        targetDate: LocalDate.parse('2031-03-05'),
        rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
        priority: 2,
      }),
    );

    const created = (await buckets.findAll()).find(
      (bucket) => bucket.name === 'Apartment',
    );
    expect(created?.target?.amount.cents).toBe(15_000_000);
  });

  it('creates an ongoing bucket (UC-6.1)', async () => {
    const { apply, shown, buckets } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'CREATE_ONGOING_BUCKET',
        name: 'Investments',
        rule: Allocation.fixed(reais(1_778)),
        priority: 3,
      }),
    );

    const created = (await buckets.findAll()).find(
      (bucket) => bucket.name === 'Investments',
    );
    expect(created?.target).toBeUndefined();
    expect(created?.rule).toEqual(Allocation.fixed(reais(1_778)));
  });

  it('changes an allocation rule (UC-6.2)', async () => {
    const { apply, shown, buckets } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'CHANGE_ALLOCATION_RULE',
        bucketId: 'reserve',
        rule: Allocation.fixed(reais(2_000)),
      }),
    );

    expect((await buckets.findById('reserve'))?.rule).toEqual(
      Allocation.fixed(reais(2_000)),
    );
  });

  it('overrides one cycle’s contribution (UC-6.5)', async () => {
    const { apply, shown, buckets } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'OVERRIDE_CONTRIBUTION',
        bucketId: 'reserve',
        month: '2026-10',
        amount: reais(500),
      }),
    );

    const events = (await buckets.findById('reserve'))?.events ?? [];
    const override = events.find((event) => event.kind === 'OVERRIDE');
    expect(events.map((event) => event.kind)).toEqual(['OVERRIDE']);
    expect(override?.amount.cents).toBe(50_000);
  });

  it('refuses a kind it does not know rather than guessing at one', async () => {
    const { apply, proposals } = wire();
    await proposals.save({
      id: 'proposal-1',
      principal: me,
      change: { kind: 'SELL_THE_HOUSE' } as unknown as ProposedChange,
      summary: 'Sell the house.',
      proposedAt: clock.now(),
      appliedAt: undefined,
    });

    await expect(
      apply.confirm(me, {
        proposalId: 'proposal-1',
        summary: 'Sell the house.',
      }),
    ).rejects.toBeInstanceOf(UnknownProposal);
  });
});

/**
 * UC-3.7 — one cycle's figure changes without touching the template behind
 * it, and can be put back. The Ledger screen carried this before it was
 * removed; it is a proposal now, like the ad-hoc entry beside it.
 */
describe('ApplyProposal — overriding one cycle\u2019s figure (UC-3.7)', () => {
  it('changes the figure without touching what generated it', async () => {
    const { apply, shown, cycles } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'OVERRIDE_ENTRY',
        month: '2026-10',
        entryId: 'rent-1',
        amount: reais(-8_000),
      }),
    );

    const overridden = (await october(cycles)).entries.find(
      (candidate) => candidate.id === 'rent-1',
    );
    expect(overridden?.amount.planned.cents).toBe(-800_000);
    expect(overridden?.isOverridden).toBe(true);
  });

  /**
   * UC-3.7 asks for reverting in one action, and the domain keeps the
   * projected amount on the origin precisely so it is possible.
   */
  it('puts the figure back to the one that was projected', async () => {
    const { apply, shown, cycles } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'OVERRIDE_ENTRY',
        month: '2026-10',
        entryId: 'rent-1',
        amount: reais(-8_000),
      }),
    );
    await apply.confirm(
      me,
      await shown({
        kind: 'REVERT_ENTRY_OVERRIDE',
        month: '2026-10',
        entryId: 'rent-1',
      }),
    );

    const reverted = (await october(cycles)).entries.find(
      (candidate) => candidate.id === 'rent-1',
    );
    expect(reverted?.amount.planned.cents).toBe(-761_000);
    expect(reverted?.isOverridden).toBe(false);
  });

  /**
   * The assistant enforces nothing (DOMAIN_MODEL §6): the domain refuses, and
   * the refusal reaches the user as the reason it gave.
   */
  it('lets the domain refuse reverting an entry that was never overridden', async () => {
    const { apply, shown } = wire();

    await expect(
      apply.confirm(
        me,
        await shown({
          kind: 'REVERT_ENTRY_OVERRIDE',
          month: '2026-10',
          entryId: 'rent-1',
        }),
      ),
    ).rejects.toThrow();
  });

  it('lets the domain refuse a cycle it cannot find', async () => {
    const { apply, shown } = wire();

    await expect(
      apply.confirm(
        me,
        await shown({
          kind: 'OVERRIDE_ENTRY',
          month: '2027-03',
          entryId: 'rent-1',
          amount: reais(-8_000),
        }),
      ),
    ).rejects.toBeInstanceOf(CycleNotFound);
  });
});

describe('ApplyProposal — the confirmation is the boundary', () => {
  it('refuses a confirmation naming a proposal nobody made', async () => {
    const { apply } = wire();

    await expect(
      apply.confirm(me, { proposalId: 'invented', summary: 'Do something.' }),
    ).rejects.toBeInstanceOf(ProposalNotFound);
  });

  it('refuses a confirmation that does not match what was shown, and writes nothing', async () => {
    const { apply, shown, cycles } = wire();
    const confirmation = await shown({
      kind: 'SETTLE_ENTRY',
      month: '2026-10',
      entryId: 'rent-1',
      status: SettlementStatus.Paid,
      actual: reais(-7_610),
    });

    await expect(
      apply.confirm(me, {
        proposalId: confirmation.proposalId,
        summary: confirmation.summary.replace('rent-1', 'salary-1'),
      }),
    ).rejects.toBeInstanceOf(ProposalMismatch);

    expect(
      (await october(cycles)).entries.every(
        (candidate) => !candidate.isSettled,
      ),
    ).toBe(true);
  });

  // FIN-116's seam: one user today makes this a tautology, and two users make
  // it the thing that stops one confirming a change composed for the other.
  it('refuses a confirmation from a principal the proposal was not composed for', async () => {
    const { apply, shown, cycles } = wire();
    const confirmation = await shown(
      {
        kind: 'SETTLE_ENTRY',
        month: '2026-10',
        entryId: 'rent-1',
        status: SettlementStatus.Paid,
        actual: undefined,
      },
      Principal.of('somebody-else'),
    );

    await expect(apply.confirm(me, confirmation)).rejects.toBeInstanceOf(
      ProposalNotYours,
    );

    expect(
      (await october(cycles)).entries.every(
        (candidate) => !candidate.isSettled,
      ),
    ).toBe(true);
  });

  it('applies a proposal once and refuses to apply it again', async () => {
    const { apply, shown, cycles } = wire();
    const confirmation = await shown({
      kind: 'ADD_ENTRY',
      month: '2026-10',
      description: 'Dentist',
      entryKind: EntryKind.Variable,
      dueDate: LocalDate.parse('2026-09-20'),
      amount: reais(-300),
      isEstimate: false,
    });

    await apply.confirm(me, confirmation);
    await expect(apply.confirm(me, confirmation)).rejects.toBeInstanceOf(
      ProposalAlreadyApplied,
    );

    expect((await october(cycles)).entries).toHaveLength(3);
  });

  it('records when a proposal was applied', async () => {
    const { apply, shown, proposals } = wire();

    await apply.confirm(
      me,
      await shown({
        kind: 'CHANGE_ALLOCATION_RULE',
        bucketId: 'reserve',
        rule: Allocation.fixed(reais(2_000)),
      }),
    );

    expect((await proposals.load('proposal-1'))?.appliedAt).toEqual(
      clock.now(),
    );
  });
});

describe('ApplyProposal — validation happens here, not when the proposal was made', () => {
  // The figures a proposal was built against can move before it is confirmed.
  // Nothing is re-checked at produce time, so the interactor has to fail the
  // way it would for any other caller (docs/DOMAIN_MODEL.md §6).
  it('fails cleanly when the entry has been settled since the proposal was made', async () => {
    const { apply, shown, cycles } = wire();
    const confirmation = await shown({
      kind: 'SETTLE_ENTRY',
      month: '2026-10',
      entryId: 'rent-1',
      status: SettlementStatus.Paid,
      actual: reais(-7_610),
    });
    await cycles.save(
      (await october(cycles)).settleEntry(
        'rent-1',
        reais(-7_000),
        SettlementStatus.Paid,
      ),
    );

    await expect(apply.confirm(me, confirmation)).rejects.toThrow(
      /já está pago/,
    );

    const entries = (await october(cycles)).entries;
    expect(
      entries.find((candidate) => candidate.id === 'rent-1')?.amount.actual
        ?.cents,
    ).toBe(-700_000);
  });

  it('leaves a proposal that failed available to try again', async () => {
    const { apply, shown, proposals, cycles } = wire();
    const confirmation = await shown({
      kind: 'ADD_ENTRY',
      month: '2027-05',
      description: 'Dentist',
      entryKind: EntryKind.Variable,
      dueDate: LocalDate.parse('2027-04-20'),
      amount: reais(-300),
      isEstimate: false,
    });

    await expect(apply.confirm(me, confirmation)).rejects.toBeInstanceOf(
      CycleNotFound,
    );

    expect((await proposals.load('proposal-1'))?.appliedAt).toBeUndefined();
    expect((await october(cycles)).entries).toHaveLength(2);
  });
});
