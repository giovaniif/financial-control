import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { Account, AccountType } from '../../domain/budgeting/account.js';
import {
  CycleRef,
  PaydayAnchor,
  ShiftPolicy,
} from '../../domain/budgeting/cycle-ref.js';
import { Cycle, CycleStatus, Estimates } from '../../domain/budgeting/cycle.js';
import {
  EntryKind,
  LedgerEntry,
  Origin,
} from '../../domain/budgeting/ledger-entry.js';
import { noHolidays } from '../../domain/ports/holiday-calendar.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import {
  Direction,
  RecurringTemplate,
  TemplateStatus,
} from '../../domain/budgeting/recurring-template.js';
import { PrismaAccountRepository } from './prisma-account-repository.js';
import { PrismaCycleRepository } from './prisma-cycle-repository.js';
import { PrismaSettingsRepository } from './prisma-settings-repository.js';
import { PrismaTemplateRepository } from './prisma-template-repository.js';

// These need a live PostgreSQL: `pnpm db:up`. Without DATABASE_URL they skip,
// so the pure suite still runs anywhere.
const databaseUrl = process.env['DATABASE_URL'];

describe.skipIf(databaseUrl === undefined || databaseUrl === '')(
  'the Prisma repositories',
  () => {
    const prisma = new PrismaClient();
    const accounts = new PrismaAccountRepository(prisma);
    const cycles = new PrismaCycleRepository(prisma);
    const settings = new PrismaSettingsRepository(prisma);
    const templates = new PrismaTemplateRepository(prisma);

    const anchor = PaydayAnchor.of(5, ShiftPolicy.Preceding);
    const august = CycleRef.forMonth('2026-08', anchor, noHolidays);

    beforeEach(async () => {
      await prisma.valueScheduleStep.deleteMany();
      await prisma.recurringTemplate.deleteMany();
      await prisma.ledgerEntry.deleteMany();
      await prisma.cycle.deleteMany();
      await prisma.account.deleteMany();
      await prisma.settings.deleteMany();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    describe('accounts', () => {
      it('round-trips an account without losing a cent', async () => {
        await accounts.save(
          Account.open({
            id: 'acc-1',
            name: 'Inter Checking',
            type: AccountType.Checking,
            balance: Money.fromCents(166_042),
          }),
        );

        const loaded = await accounts.findById('acc-1');

        expect(loaded?.name).toBe('Inter Checking');
        expect(loaded?.type).toBe(AccountType.Checking);
        expect(loaded?.balance.cents).toBe(166_042);
      });

      it('stores an overdrawn balance as a negative amount', async () => {
        await accounts.save(
          Account.open({
            id: 'acc-2',
            name: 'Overdrawn',
            type: AccountType.Checking,
            balance: Money.fromCents(-42_000),
          }),
        );

        expect((await accounts.findById('acc-2'))?.balance.cents).toBe(-42_000);
      });

      it('updates in place rather than inserting twice', async () => {
        const account = Account.open({
          id: 'acc-3',
          name: 'Cash',
          type: AccountType.Cash,
          balance: Money.fromCents(18_000),
        });

        await accounts.save(account);
        await accounts.save(account.correctBalanceTo(Money.fromCents(9_000)));

        const all = await accounts.findAll();
        expect(all).toHaveLength(1);
        expect(all[0]?.balance.cents).toBe(9_000);
      });

      // PostgreSQL orders an enum by its declared order, so this is
      // CHECKING, SAVINGS, CASH — everyday accounts first, cash last.
      it('orders by type and then name, as the sidebar lists them', async () => {
        await accounts.save(
          Account.open({
            id: 'b',
            name: 'Nubank',
            type: AccountType.Checking,
            balance: Money.zero(),
          }),
        );
        await accounts.save(
          Account.open({
            id: 'c',
            name: 'Wallet',
            type: AccountType.Cash,
            balance: Money.zero(),
          }),
        );
        await accounts.save(
          Account.open({
            id: 'a',
            name: 'Inter',
            type: AccountType.Checking,
            balance: Money.zero(),
          }),
        );

        expect((await accounts.findAll()).map((a) => a.name)).toEqual([
          'Inter',
          'Nubank',
          'Wallet',
        ]);
      });

      it('reports nothing for an account that is not there', async () => {
        expect(await accounts.findById('missing')).toBeUndefined();
      });

      it('deletes', async () => {
        await accounts.save(
          Account.open({
            id: 'acc-4',
            name: 'Temp',
            type: AccountType.Cash,
            balance: Money.zero(),
          }),
        );
        await accounts.delete('acc-4');

        expect(await accounts.findAll()).toHaveLength(0);
      });
    });

    describe('cycles', () => {
      const withEntries = () =>
        Cycle.open({
          id: 'cycle-aug',
          ref: august,
          openingBalance: Money.fromCents(216_000),
          entries: [
            LedgerEntry.create({
              id: 'e-salary',
              description: 'Salary',
              kind: EntryKind.Income,
              dueDate: LocalDate.parse('2026-08-05'),
              planned: Money.fromCents(1_800_000),
              origin: Origin.fromTemplate('tpl-salary'),
            }),
            LedgerEntry.create({
              id: 'e-health',
              description: 'Health Plan',
              kind: EntryKind.Fixed,
              dueDate: LocalDate.parse('2026-08-08'),
              planned: Money.fromCents(-32_000),
              origin: Origin.fromTemplate('tpl-health'),
            }),
            LedgerEntry.create({
              id: 'e-pj',
              description: 'Contractor Costs',
              kind: EntryKind.Fixed,
              dueDate: LocalDate.parse('2026-08-25'),
              planned: Money.fromCents(-150_000),
              isEstimate: true,
            }),
          ],
        });

      it('round-trips a cycle and its entries', async () => {
        await cycles.save(withEntries());

        const loaded = await cycles.findByMonth(august);

        expect(loaded?.id).toBe('cycle-aug');
        expect(loaded?.openingBalance.cents).toBe(216_000);
        expect(loaded?.entries).toHaveLength(3);
      });

      it('rebuilds a chain identical to the one that was saved', async () => {
        const original = withEntries();
        await cycles.save(original);

        const loaded = await cycles.findByMonth(august);

        expect(loaded?.chain().netSurplus.cents).toBe(
          original.chain().netSurplus.cents,
        );
        expect(loaded?.chain(Estimates.Excluded).netSurplus.cents).toBe(
          original.chain(Estimates.Excluded).netSurplus.cents,
        );
      });

      // A DATE column and a UTC read, so the day cannot drift either way.
      it('keeps a due date on the same calendar day', async () => {
        await cycles.save(withEntries());

        const loaded = await cycles.findByMonth(august);
        const salary = loaded?.entries.find((e) => e.description === 'Salary');

        expect(salary?.dueDate.toISO()).toBe('2026-08-05');
      });

      it('preserves the estimate flag', async () => {
        await cycles.save(withEntries());

        const loaded = await cycles.findByMonth(august);
        const estimate = loaded?.entries.find((e) => e.isEstimate);

        expect(estimate?.description).toBe('Contractor Costs');
      });

      it('preserves the origin an entry was generated from', async () => {
        await cycles.save(withEntries());

        const loaded = await cycles.findByMonth(august);
        const salary = loaded?.entries.find((e) => e.description === 'Salary');

        expect(salary?.origin).toEqual({
          kind: 'FROM_TEMPLATE',
          templateId: 'tpl-salary',
        });
      });

      it('preserves a settled entry with its actual amount', async () => {
        const settled = withEntries().settleEntry(
          'e-health',
          Money.fromCents(-32_016),
          SettlementStatus.Paid,
        );
        await cycles.save(settled);

        const loaded = await cycles.findByMonth(august);
        const health = loaded?.entries.find(
          (e) => e.description === 'Health Plan',
        );

        expect(health?.status).toBe(SettlementStatus.Paid);
        expect(health?.amount.actual?.cents).toBe(-32_016);
        expect(health?.amount.variance?.cents).toBe(-16);
      });

      it('preserves a skipped entry', async () => {
        await cycles.save(withEntries().skipEntry('e-pj'));

        const loaded = await cycles.findByMonth(august);
        const skipped = loaded?.entries.find(
          (e) => e.description === 'Contractor Costs',
        );

        expect(skipped?.status).toBe(SettlementStatus.Skipped);
        expect(skipped?.realised.isZero()).toBe(true);
      });

      it('preserves an override and what it replaced', async () => {
        await cycles.save(
          withEntries().overrideEntry('e-health', Money.fromCents(-45_000)),
        );

        const loaded = await cycles.findByMonth(august);
        const health = loaded?.entries.find(
          (e) => e.description === 'Health Plan',
        );

        expect(health?.amount.planned.cents).toBe(-45_000);
        expect(
          health?.origin.kind === 'OVERRIDE' && health.origin.projected.cents,
        ).toBe(-32_000);
        expect(health?.revertOverride().amount.planned.cents).toBe(-32_000);
      });

      it('preserves a closed status', async () => {
        const closed = withEntries()
          .skipEntry('e-salary')
          .skipEntry('e-health')
          .skipEntry('e-pj')
          .close();
        await cycles.save(closed);

        expect((await cycles.findByMonth(august))?.status).toBe(
          CycleStatus.Closed,
        );
      });

      it('replaces the entries wholesale rather than accumulating them', async () => {
        await cycles.save(withEntries());
        await cycles.save(withEntries().removeEntry('e-pj'));

        expect((await cycles.findByMonth(august))?.entries).toHaveLength(2);
      });

      it('reads entries back in due-date order', async () => {
        await cycles.save(withEntries());

        const loaded = await cycles.findByMonth(august);

        expect(loaded?.entries.map((e) => e.description)).toEqual([
          'Salary',
          'Health Plan',
          'Contractor Costs',
        ]);
      });

      it('reports nothing for a month that has never been materialised', async () => {
        expect(await cycles.findByMonth(august)).toBeUndefined();
      });

      // What makes template generation safe to re-run.
      it('refuses a second entry from the same template in one cycle', async () => {
        await cycles.save(withEntries());

        const duplicate = LedgerEntry.create({
          id: 'e-salary-again',
          description: 'Salary (duplicate)',
          kind: EntryKind.Income,
          dueDate: LocalDate.parse('2026-08-05'),
          planned: Money.fromCents(1_800_000),
          origin: Origin.fromTemplate('tpl-salary'),
        });

        const loaded = await cycles.findByMonth(august);
        const clash = Cycle.rehydrate({
          id: 'cycle-aug',
          ref: august,
          status: CycleStatus.Open,
          openingBalance: Money.zero(),
          entries: [...(loaded?.entries ?? []), duplicate],
        });

        await expect(cycles.save(clash)).rejects.toThrow();
      });

      it('allows several manual entries, which carry no origin ref', async () => {
        const manual = (id: string, description: string) =>
          LedgerEntry.create({
            id,
            description,
            kind: EntryKind.Variable,
            dueDate: LocalDate.parse('2026-08-14'),
            planned: Money.fromCents(42_000),
          });

        await cycles.save(
          Cycle.open({
            id: 'cycle-aug',
            ref: august,
            openingBalance: Money.zero(),
            entries: [manual('m1', 'Dinner split'), manual('m2', 'Gift')],
          }),
        );

        expect((await cycles.findByMonth(august))?.entries).toHaveLength(2);
      });
    });

    describe('settings', () => {
      it('defaults to the 5th, moving back off a closed bank', async () => {
        const anchorSetting = await settings.load();

        expect(anchorSetting.dayOfMonth).toBe(5);
        expect(anchorSetting.shiftPolicy).toBe(ShiftPolicy.Preceding);
      });

      it('round-trips a configured anchor', async () => {
        await settings.save(PaydayAnchor.of(7, ShiftPolicy.Following));

        const loaded = await settings.load();

        expect(loaded.dayOfMonth).toBe(7);
        expect(loaded.shiftPolicy).toBe(ShiftPolicy.Following);
      });

      it('keeps exactly one row however often it is saved', async () => {
        await settings.save(PaydayAnchor.of(7, ShiftPolicy.Following));
        await settings.save(PaydayAnchor.of(10, ShiftPolicy.Preceding));

        expect(await prisma.settings.count()).toBe(1);
        expect((await settings.load()).dayOfMonth).toBe(10);
      });
    });

    describe('recurring templates', () => {
      const salary = () =>
        RecurringTemplate.create({
          id: 'tpl-salary',
          name: 'Salary',
          direction: Direction.In,
          dueDayOfMonth: 5,
          amount: Money.fromCents(1_000_000),
          startMonth: '2026-08',
          valueSchedule: [
            { fromMonth: '2026-09', amount: Money.fromCents(1_800_000) },
          ],
        });

      it('round-trips a template and its schedule', async () => {
        await templates.save(salary());

        const loaded = await templates.findById('tpl-salary');

        expect(loaded?.name).toBe('Salary');
        expect(loaded?.direction).toBe(Direction.In);
        expect(loaded?.dueDayOfMonth).toBe(5);
        expect(loaded?.baseAmount.cents).toBe(1_000_000);
        expect(loaded?.valueSchedule).toHaveLength(1);
      });

      it('resolves the same amounts after a round trip', async () => {
        await templates.save(salary());

        const loaded = await templates.findById('tpl-salary');

        expect(loaded?.amountFor(august).cents).toBe(1_000_000);
        expect(
          loaded?.amountFor(CycleRef.forMonth('2026-09', anchor, noHolidays))
            .cents,
        ).toBe(1_800_000);
      });

      it('keeps the schedule in cycle order', async () => {
        await templates.save(
          RecurringTemplate.create({
            id: 'tpl-reno',
            name: 'Renovation Progress',
            direction: Direction.Out,
            dueDayOfMonth: 20,
            amount: Money.fromCents(-120_000),
            startMonth: '2026-08',
            valueSchedule: [
              { fromMonth: '2026-11', amount: Money.fromCents(-134_000) },
              { fromMonth: '2026-09', amount: Money.fromCents(-125_000) },
              { fromMonth: '2026-10', amount: Money.fromCents(-130_000) },
            ],
          }),
        );

        const loaded = await templates.findById('tpl-reno');

        expect(loaded?.valueSchedule.map((s) => s.fromMonth)).toEqual([
          '2026-09',
          '2026-10',
          '2026-11',
        ]);
      });

      it('replaces the schedule wholesale rather than accumulating steps', async () => {
        await templates.save(salary());
        await templates.save(
          salary().scheduleAmountFrom('2026-09', Money.fromCents(1_900_000)),
        );

        const loaded = await templates.findById('tpl-salary');

        expect(loaded?.valueSchedule).toHaveLength(1);
        expect(loaded?.valueSchedule[0]?.amount.cents).toBe(1_900_000);
      });

      it('preserves the lifecycle status and the estimate flag', async () => {
        await templates.save(salary().pause().asEstimate(true));

        const loaded = await templates.findById('tpl-salary');

        expect(loaded?.status).toBe(TemplateStatus.Paused);
        expect(loaded?.isEstimate).toBe(true);
      });

      it('preserves an end cycle', async () => {
        await templates.save(salary().endOn('2026-12'));

        expect((await templates.findById('tpl-salary'))?.endMonth).toBe(
          '2026-12',
        );
      });

      it('lists them by name', async () => {
        await templates.save(salary());
        await templates.save(
          RecurringTemplate.create({
            id: 'tpl-health',
            name: 'Health Plan',
            direction: Direction.Out,
            dueDayOfMonth: 8,
            amount: Money.fromCents(-32_000),
            startMonth: '2026-08',
          }),
        );

        expect((await templates.findAll()).map((t) => t.name)).toEqual([
          'Health Plan',
          'Salary',
        ]);
      });

      it('reports nothing for a template that is not there', async () => {
        expect(await templates.findById('missing')).toBeUndefined();
      });

      it('deletes a template and its schedule with it', async () => {
        await templates.save(salary());
        await templates.delete('tpl-salary');

        expect(await templates.findAll()).toHaveLength(0);
        expect(await prisma.valueScheduleStep.count()).toBe(0);
      });
    });
  },
);
