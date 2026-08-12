import { describe, expect, it } from 'vitest';

import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle } from '../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
  Origin,
} from '../../domain/budgeting/ledger-entry.js';
import {
  Direction,
  RecurringTemplate,
  TemplateStatus,
} from '../../domain/budgeting/recurring-template.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import {
  InMemoryCycleRepository,
  InMemorySettingsRepository,
  InMemoryTemplateRepository,
} from '../testing/fakes.js';
import { FixedClock } from '../testing/fixed-clock.js';
import {
  EditScope,
  ManageTemplates,
  TemplateNotFound,
} from './uc-2-manage-templates.js';

const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
const september = CycleRef.forMonth('2026-09', anchor, noHolidays);
const clock = FixedClock.at('2026-08-10T12:00:00Z');
const reais = (amount: number) => Money.fromCents(amount * 100);

const template = (
  overrides: Partial<Parameters<typeof RecurringTemplate.create>[0]> = {},
) =>
  RecurringTemplate.create({
    id: 'tpl-health',
    name: 'Health Plan',
    direction: Direction.Out,
    dueDayOfMonth: 8,
    amount: reais(-320),
    startMonth: '2026-09',
    ...overrides,
  });

const managing = (
  options: {
    templates?: RecurringTemplate[];
    cycles?: Cycle[];
  } = {},
) => {
  const templateRepo = new InMemoryTemplateRepository(options.templates ?? []);
  const cycleRepo = new InMemoryCycleRepository(options.cycles ?? []);
  let next = 0;

  return {
    templateRepo,
    cycleRepo,
    useCase: new ManageTemplates(
      templateRepo,
      cycleRepo,
      new InMemorySettingsRepository(anchor),
      noHolidays,
      clock,
      () => `tpl-${String(++next)}`,
    ),
  };
};

describe('ManageTemplates.create', () => {
  it('stores a template and reports it back', async () => {
    const { useCase, templateRepo } = managing();

    const created = await useCase.create({
      name: 'Electricity',
      direction: Direction.Out,
      dueDayOfMonth: 15,
      amountCents: -28_000,
    });

    expect(created.id).toBe('tpl-1');
    expect(created.amountCents).toBe(-28_000);
    expect(await templateRepo.findById('tpl-1')).toBeDefined();
  });

  it('starts from the current cycle when no start is given', async () => {
    const { useCase } = managing();

    const created = await useCase.create({
      name: 'Electricity',
      direction: Direction.Out,
      dueDayOfMonth: 15,
      amountCents: -28_000,
    });

    expect(created.startMonth).toBe('2026-09');
  });

  it('reports the next cycle it will generate into', async () => {
    const { useCase } = managing();

    const created = await useCase.create({
      name: 'Bonus',
      direction: Direction.In,
      dueDayOfMonth: 20,
      amountCents: 100_000,
      startMonth: '2026-12',
    });

    expect(created.nextOccurrenceMonth).toBe('2026-12');
  });

  it('carries an end cycle and the estimate flag through creation', async () => {
    const { useCase } = managing();

    const created = await useCase.create({
      name: 'Contractor Costs',
      direction: Direction.Out,
      dueDayOfMonth: 25,
      amountCents: -150_000,
      startMonth: '2026-09',
      endMonth: '2027-01',
      isEstimate: true,
    });

    expect(created.endMonth).toBe('2027-01');
    expect(created.isEstimate).toBe(true);
  });

  it('refuses a blank name', async () => {
    const { useCase } = managing();

    await expect(
      useCase.create({
        name: ' ',
        direction: Direction.Out,
        dueDayOfMonth: 15,
        amountCents: -1,
      }),
    ).rejects.toThrow();
  });
});

describe('ManageTemplates.changeAmount — the scope choice', () => {
  // UC-2.3: salary is 10.000 through September and 18.000 from October.
  it('applies a "this and future" change from that cycle onward', async () => {
    const salary = template({
      id: 'tpl-salary',
      name: 'Salary',
      direction: Direction.In,
      dueDayOfMonth: 5,
      amount: reais(10_000),
    });
    const { useCase, templateRepo } = managing({ templates: [salary] });

    await useCase.changeAmount({
      templateId: 'tpl-salary',
      fromMonth: '2026-10',
      amountCents: 1_800_000,
      scope: EditScope.ThisAndFuture,
    });

    const stored = await templateRepo.findById('tpl-salary');
    expect(stored?.amountFor(september).cents).toBe(1_000_000);
    expect(
      stored?.amountFor(CycleRef.forMonth('2026-10', anchor, noHolidays)).cents,
    ).toBe(1_800_000);
  });

  it('leaves the template alone for a "this cycle only" change', async () => {
    const cycle = Cycle.open({
      id: 'cycle-sep',
      ref: september,
      openingBalance: Money.zero(),
      entries: [
        LedgerEntry.create({
          id: 'e1',
          description: 'Health Plan',
          kind: EntryKind.Fixed,
          dueDate: LocalDate.parse('2026-08-08'),
          planned: reais(-320),
          origin: Origin.fromTemplate('tpl-health'),
        }),
      ],
    });
    const { useCase, templateRepo, cycleRepo } = managing({
      templates: [template()],
      cycles: [cycle],
    });

    await useCase.changeAmount({
      templateId: 'tpl-health',
      fromMonth: '2026-09',
      amountCents: -45_000,
      scope: EditScope.ThisCycleOnly,
    });

    expect((await templateRepo.findById('tpl-health'))?.hasValueSchedule).toBe(
      false,
    );
    const saved = await cycleRepo.findByMonth(september);
    expect(saved?.entries[0]?.amount.planned.cents).toBe(-45_000);
    expect(saved?.entries[0]?.isOverridden).toBe(true);
  });

  it('does nothing to a cycle that has no entry from that template', async () => {
    const { useCase, cycleRepo } = managing({ templates: [template()] });

    await useCase.changeAmount({
      templateId: 'tpl-health',
      fromMonth: '2026-09',
      amountCents: -45_000,
      scope: EditScope.ThisCycleOnly,
    });

    expect(cycleRepo.saved).toHaveLength(0);
  });

  // An entry the user already overrode is still that template's entry, so a
  // second this-cycle-only change edits it rather than missing it.
  it('overrides an entry that was already overridden', async () => {
    const cycle = Cycle.open({
      id: 'cycle-sep',
      ref: september,
      openingBalance: Money.zero(),
      entries: [
        LedgerEntry.create({
          id: 'e1',
          description: 'Health Plan',
          kind: EntryKind.Fixed,
          dueDate: LocalDate.parse('2026-08-08'),
          planned: reais(-320),
          origin: Origin.fromTemplate('tpl-health'),
        }),
      ],
    }).overrideEntry('e1', reais(-400));
    const { useCase, cycleRepo } = managing({
      templates: [template()],
      cycles: [cycle],
    });

    await useCase.changeAmount({
      templateId: 'tpl-health',
      fromMonth: '2026-09',
      amountCents: -50_000,
      scope: EditScope.ThisCycleOnly,
    });

    const saved = await cycleRepo.findByMonth(september);
    expect(saved?.entries[0]?.amount.planned.cents).toBe(-50_000);
  });

  it('leaves a manual entry alone: it belongs to no template', async () => {
    const cycle = Cycle.open({
      id: 'cycle-sep',
      ref: september,
      openingBalance: Money.zero(),
      entries: [
        LedgerEntry.create({
          id: 'manual',
          description: 'Dinner split',
          kind: EntryKind.Variable,
          dueDate: LocalDate.parse('2026-08-14'),
          planned: reais(120),
        }),
      ],
    });
    const { useCase, cycleRepo } = managing({
      templates: [template()],
      cycles: [cycle],
    });

    await useCase.changeAmount({
      templateId: 'tpl-health',
      fromMonth: '2026-09',
      amountCents: -50_000,
      scope: EditScope.ThisCycleOnly,
    });

    expect(cycleRepo.saved).toHaveLength(1);
    expect(cycleRepo.saved[0]?.entries[0]?.isOverridden).toBe(false);
  });

  it('refuses a template that is not there', async () => {
    const { useCase } = managing();

    await expect(
      useCase.changeAmount({
        templateId: 'missing',
        fromMonth: '2026-09',
        amountCents: 1,
        scope: EditScope.ThisAndFuture,
      }),
    ).rejects.toThrow(TemplateNotFound);
  });
});

describe('ManageTemplates lifecycle', () => {
  it('pauses and resumes', async () => {
    const { useCase } = managing({ templates: [template()] });

    expect((await useCase.pause('tpl-health')).status).toBe(
      TemplateStatus.Paused,
    );
    expect((await useCase.resume('tpl-health')).status).toBe(
      TemplateStatus.Active,
    );
  });

  it('renames', async () => {
    const { useCase } = managing({ templates: [template()] });

    expect((await useCase.rename('tpl-health', 'Health Insurance')).name).toBe(
      'Health Insurance',
    );
  });

  it('ends on a chosen cycle', async () => {
    const { useCase } = managing({ templates: [template()] });

    expect((await useCase.endOn('tpl-health', '2027-01')).endMonth).toBe(
      '2027-01',
    );
  });

  it('flags an unconfirmed estimate', async () => {
    const { useCase } = managing({ templates: [template()] });

    expect((await useCase.flagAsEstimate('tpl-health', true)).isEstimate).toBe(
      true,
    );
  });

  it('deletes', async () => {
    const { useCase, templateRepo } = managing({ templates: [template()] });

    await useCase.delete('tpl-health');

    expect(await templateRepo.findAll()).toHaveLength(0);
  });

  it.each([
    ['renaming', (u: ManageTemplates) => u.rename('missing', 'X')],
    ['pausing', (u: ManageTemplates) => u.pause('missing')],
    ['deleting', (u: ManageTemplates) => u.delete('missing')],
  ])('refuses %s a template that is not there', async (_name, act) => {
    await expect(act(managing().useCase)).rejects.toThrow(TemplateNotFound);
  });
});

describe('ManageTemplates.list — the summary', () => {
  const populated = () =>
    managing({
      templates: [
        template({
          id: 'tpl-salary',
          name: 'Salary',
          direction: Direction.In,
          dueDayOfMonth: 5,
          amount: reais(18_000),
        }),
        template({
          id: 'tpl-health',
          name: 'Health Plan',
          amount: reais(-320),
        }),
        template({
          id: 'tpl-power',
          name: 'Electricity',
          dueDayOfMonth: 15,
          amount: reais(-280),
        }),
        template({
          id: 'tpl-pj',
          name: 'Contractor Costs',
          dueDayOfMonth: 25,
          amount: reais(-1_500),
          isEstimate: true,
        }),
      ],
    }).useCase;

  it('totals the fixed commitment as a positive figure', async () => {
    const { summary } = await populated().list();

    expect(summary.fixedCommitmentCents).toBe(210_000);
    expect(summary.activeOutcomeCount).toBe(3);
  });

  it('totals the fixed income', async () => {
    expect((await populated().list()).summary.fixedIncomeCents).toBe(1_800_000);
  });

  it('totals what the user is only guessing at', async () => {
    expect((await populated().list()).summary.unconfirmedEstimatesCents).toBe(
      150_000,
    );
  });

  it('names what falls off within the twelve cycles', async () => {
    const { useCase } = managing({
      templates: [
        template({ id: 'a', name: 'Ending soon', endMonth: '2027-01' }),
        template({ id: 'b', name: 'Ending later', endMonth: '2030-02' }),
      ],
    });

    expect((await useCase.list()).summary.endingWithinTwelve).toEqual([
      'Ending soon',
    ]);
  });

  it('leaves a paused template out of the commitment', async () => {
    const { useCase } = managing({ templates: [template().pause()] });

    const { summary } = await useCase.list();

    expect(summary.fixedCommitmentCents).toBe(0);
    expect(summary.activeOutcomeCount).toBe(0);
  });

  it('summarises an empty list to zeroes', async () => {
    const { summary } = await managing().useCase.list();

    expect(summary).toEqual({
      fixedCommitmentCents: 0,
      activeOutcomeCount: 0,
      fixedIncomeCents: 0,
      unconfirmedEstimatesCents: 0,
      endingWithinTwelve: [],
    });
  });
});

describe('ManageTemplates identity', () => {
  // Production supplies no id generator; the default has to produce one.
  it('generates an id when none is supplied', async () => {
    const useCase = new ManageTemplates(
      new InMemoryTemplateRepository(),
      new InMemoryCycleRepository(),
      new InMemorySettingsRepository(anchor),
      noHolidays,
      clock,
    );

    const created = await useCase.create({
      name: 'Electricity',
      direction: Direction.Out,
      dueDayOfMonth: 15,
      amountCents: -28_000,
    });

    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('ManageTemplates summary edge cases', () => {
  it('counts nothing for a template that has not started yet', async () => {
    const { useCase } = managing({
      templates: [template({ startMonth: '2030-02' })],
    });

    const { summary, templates } = await useCase.list();

    expect(summary.fixedCommitmentCents).toBe(0);
    expect(templates[0]?.nextOccurrenceMonth).toBeUndefined();
  });

  it('counts nothing for a template that already ended', async () => {
    const { useCase } = managing({
      templates: [template({ startMonth: '2026-02', endMonth: '2026-07' })],
    });

    expect((await useCase.list()).summary.fixedCommitmentCents).toBe(0);
  });
});
