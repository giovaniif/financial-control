import { describe, expect, it } from 'vitest';

import { ShiftPolicy } from '../../domain/budgeting/cycle-ref.js';
import { EntryKind } from '../../domain/budgeting/ledger-entry.js';
import { Direction } from '../../domain/budgeting/recurring-template.js';
import { Allocation } from '../../domain/goals/bucket.js';
import { LocalDate } from '../../domain/shared/local-date.js';
import { Money } from '../../domain/shared/money.js';
import { Percentage } from '../../domain/shared/percentage.js';
import { SettlementStatus } from '../../domain/shared/planned-actual.js';
import { EditScope } from '../budgeting/uc-2-manage-templates.js';

import type { ProposedChange } from './proposed-change.js';
import { summarise, UnknownProposal } from './proposed-change.js';

const reais = (amount: number) => Money.fromCents(Math.round(amount * 100));

const settleRent: ProposedChange = {
  kind: 'SETTLE_ENTRY',
  month: '2026-10',
  entryId: 'rent-1',
  status: SettlementStatus.Paid,
  actual: reais(-7_610),
};

describe('summarise — the sentence the user confirms', () => {
  it.each<[string, ProposedChange, string]>([
    [
      'settling at an actual amount',
      settleRent,
      'Dar baixa no lançamento rent-1 do ciclo 2026-10 como pago, por R$ -7.610,00.',
    ],
    [
      'settling at the planned amount',
      { ...settleRent, actual: undefined },
      'Dar baixa no lançamento rent-1 do ciclo 2026-10 como pago, pelo valor planejado.',
    ],
    [
      'adding an ad-hoc entry',
      {
        kind: 'ADD_ENTRY',
        month: '2026-10',
        description: 'Dentist',
        entryKind: EntryKind.Variable,
        dueDate: LocalDate.parse('2026-09-20'),
        amount: reais(-300),
        isEstimate: false,
      },
      'Adicionar “Dentist” ao ciclo 2026-10 — um lançamento variável de R$ -300,00 com vencimento em 2026-09-20.',
    ],
    [
      'adding an entry that is only an estimate',
      {
        kind: 'ADD_ENTRY',
        month: '2026-10',
        description: 'Contractor',
        entryKind: EntryKind.Fixed,
        dueDate: LocalDate.parse('2026-09-20'),
        amount: reais(-1_500),
        isEstimate: true,
      },
      'Adicionar “Contractor” ao ciclo 2026-10 — uma conta fixa de R$ -1.500,00 com vencimento em 2026-09-20, uma estimativa.',
    ],
    [
      'a recurring outcome',
      {
        kind: 'CREATE_TEMPLATE',
        name: 'Health Plan',
        direction: Direction.Out,
        dueDayOfMonth: 8,
        amount: reais(-320),
        startMonth: '2026-10',
        endMonth: undefined,
        isEstimate: false,
      },
      'Criar a saída recorrente “Health Plan” de R$ -320,00 no dia 8, a partir do ciclo 2026-10.',
    ],
    [
      'a recurring income that ends',
      {
        kind: 'CREATE_TEMPLATE',
        name: 'Consulting',
        direction: Direction.In,
        dueDayOfMonth: 20,
        amount: reais(2_000),
        startMonth: undefined,
        endMonth: '2027-03',
        isEstimate: true,
      },
      'Criar a entrada recorrente “Consulting” de R$ 2.000,00 no dia 20, a partir do ciclo atual até o ciclo 2027-03, uma estimativa.',
    ],
    [
      'a template amount changing from here on',
      {
        kind: 'CHANGE_TEMPLATE_AMOUNT',
        templateId: 'salary',
        fromMonth: '2026-11',
        amount: reais(18_000),
        scope: EditScope.ThisAndFuture,
      },
      'Mudar a recorrência salary para R$ 18.000,00 a partir do ciclo 2026-11, neste ciclo e em todos os futuros.',
    ],
    [
      'a template amount changing once',
      {
        kind: 'CHANGE_TEMPLATE_AMOUNT',
        templateId: 'salary',
        fromMonth: '2026-11',
        amount: reais(18_000),
        scope: EditScope.ThisCycleOnly,
      },
      'Mudar a recorrência salary para R$ 18.000,00 a partir do ciclo 2026-11, somente neste ciclo.',
    ],
    [
      'moving the payday anchor',
      {
        kind: 'CHANGE_PAYDAY_ANCHOR',
        anchorDay: 7,
        shiftPolicy: ShiftPolicy.Following,
      },
      'Mudar o dia do pagamento para o dia 7, indo para o dia útil seguinte quando esse dia cai em fim de semana ou feriado.',
    ],
    [
      'a goal bucket',
      {
        kind: 'CREATE_GOAL_BUCKET',
        name: 'Apartment',
        target: reais(150_000),
        targetDate: LocalDate.parse('2031-03-05'),
        rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(20)),
        priority: 2,
      },
      'Criar a caixinha de meta “Apartment” — 20 % da Sobra Esperada por ciclo rumo a R$ 150.000,00 até 2031-03-05, prioridade #2.',
    ],
    [
      'an ongoing bucket',
      {
        kind: 'CREATE_ONGOING_BUCKET',
        name: 'Investments',
        rule: Allocation.fixed(reais(1_778)),
        priority: 3,
      },
      'Criar a caixinha contínua “Investments” — R$ 1.778,00 por ciclo, prioridade #3.',
    ],
    [
      'a rule change',
      {
        kind: 'CHANGE_ALLOCATION_RULE',
        bucketId: 'apartment',
        rule: Allocation.percentOfExpectedSurplus(Percentage.ofPercent(25)),
      },
      'Mudar a caixinha apartment para receber 25 % da Sobra Esperada por ciclo.',
    ],
    [
      'a one-off contribution',
      {
        kind: 'OVERRIDE_CONTRIBUTION',
        bucketId: 'reserve',
        month: '2026-10',
        amount: reais(500),
      },
      'Colocar R$ 500,00 na caixinha reserve no ciclo 2026-10, só desta vez.',
    ],
  ])('describes %s', (_name, change, expected) => {
    expect(summarise(change)).toBe(expected);
  });

  it('names every field that would be written, so a swap is visible', () => {
    expect(summarise({ ...settleRent, entryId: 'rent-2' })).not.toBe(
      summarise(settleRent),
    );
    expect(summarise({ ...settleRent, actual: reais(-7_611) })).not.toBe(
      summarise(settleRent),
    );
  });

  it('refuses a kind it does not know rather than describing it vaguely', () => {
    expect(() =>
      summarise({ kind: 'SELL_THE_HOUSE' } as unknown as ProposedChange),
    ).toThrow(UnknownProposal);
  });
});
