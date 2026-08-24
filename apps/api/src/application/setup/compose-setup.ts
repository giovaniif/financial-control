import type { Clock } from '../../domain/ports/clock.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type {
  SetupBucket,
  SetupCycle,
  SetupDocument,
  SetupEntry,
  SetupTemplate,
} from './setup-document.js';
import type { WriteSetupDocument } from './write-setup-document.js';

import type { DraftBill, DraftBucket, SetupDraft } from './setup-draft.js';
import type { SetupConversations } from './uc-1-5-converse-setup.js';
import { SetupConversationNotFound } from './uc-1-5-converse-setup.js';

export class SetupNotComplete extends DomainError {}

const SALARY = 'Salário';

/**
 * UC-1.5 — a finished setup conversation as a v1 backup document.
 *
 * **Templates rather than materialised cycles.** The app generates a cycle
 * from its templates, lazily and idempotently, so writing cycles here would
 * duplicate the engine and hand-chain every opening balance. The one
 * exception is a cycle that cannot reach a bill's due day, which generates
 * nothing at all there: see {@link composeCycles}.
 *
 * Nothing arithmetic happens on the way through: the draft has already
 * validated every record and normalised every sign. What is left is a
 * mapping, plus the ids the draft deliberately does not carry — a card names
 * the account that pays it, and this is where that name becomes an id.
 */
export function composeSetup(
  draft: SetupDraft,
  composedAt: string,
): SetupDocument {
  const anchor = draft.anchor;
  if (!draft.isComplete || anchor === undefined) {
    throw new SetupNotComplete(
      `A configuração ainda precisa responder: ${draft.remainingSections.join(', ')}.`,
    );
  }

  const accounts = draft.accounts.map((account, index) => ({
    id: `acc-${String(index + 1)}`,
    name: account.name,
    type: account.type,
    balance: account.balance.cents,
  }));

  const generated = composeTemplates(draft);

  return {
    composedAt,
    anchor: { anchorDay: anchor.dayOfMonth, shiftPolicy: anchor.shiftPolicy },
    accounts,
    cycles: composeCycles(generated),
    templates: generated.map((composed) => composed.template),
    buckets: draft.buckets.map(composeBucket),
  };
}

/** A template, and the bill it came from where one did — never the salary. */
interface ComposedTemplate {
  readonly template: SetupTemplate;
  readonly bill: DraftBill | undefined;
}

/**
 * The cycles that cannot reach a bill's due day, each carrying the entry the
 * generator could never produce there — UC-1.7, FIN-117.
 *
 * Materialising the entry is the whole of the mechanism: generation is keyed
 * by the template that produced an entry, so a cycle already holding one is
 * left exactly as it is, and every other cycle still generates the bill on
 * its real due day. Nothing about the generator changes.
 *
 * The entry is the template's own rather than an `OVERRIDE`: an override
 * carries the amount that was projected and offers a revert to it (UC-3.7),
 * and no amount was overridden here — only the one date the cycle cannot
 * reach.
 */
function composeCycles(generated: readonly ComposedTemplate[]): SetupCycle[] {
  const byMonth = new Map<string, SetupEntry[]>();

  for (const { template, bill } of generated) {
    for (const override of bill?.dueDateOverrides ?? []) {
      const entries = byMonth.get(override.month) ?? [];
      entries.push({
        id: `${template.id}-${override.month}`,
        description: template.name,
        kind: 'FIXED',
        dueDate: override.date.toISO(),
        planned: template.amount,
        actual: null,
        status: 'PENDING',
        isEstimate: template.isEstimate,
        origin: { kind: 'FROM_TEMPLATE', ref: template.id },
      });
      byMonth.set(override.month, entries);
    }
  }

  return [...byMonth.entries()]
    .sort(([month], [other]) => month.localeCompare(other))
    .map(([month, entries]) => ({
      month,
      status: 'OPEN',
      // Nothing has been closed, so no cycle carries anything forward yet —
      // the same zero an unmaterialised cycle opens on.
      openingBalance: 0,
      entries,
    }));
}

function composeTemplates(draft: SetupDraft): ComposedTemplate[] {
  const salary = draft.salary;
  const bills = [...draft.fixedBills, ...draft.variableBills];

  // The salary is dated by the payday anchor and never by an answer of its
  // own: a second answer could only disagree with the cycle boundary. UC-2.2.
  const salaryTemplate: ComposedTemplate[] =
    salary === undefined || draft.salaryDueDayOfMonth === undefined
      ? []
      : [
          {
            template: template({
              index: 0,
              name: SALARY,
              direction: 'IN' as const,
              amount: salary.cents,
              dueDayOfMonth: draft.salaryDueDayOfMonth,
              isEstimate: false,
              startMonth: draft.startMonth,
            }),
            bill: undefined,
          },
        ];

  return [
    ...salaryTemplate,
    ...bills.map((bill: DraftBill, index): ComposedTemplate => ({
      template: template({
        index: salaryTemplate.length + index,
        name: bill.name,
        direction: 'OUT' as const,
        amount: bill.amount.cents,
        dueDayOfMonth: bill.dueDayOfMonth,
        isEstimate: bill.isEstimate,
        startMonth: draft.startMonth,
      }),
      bill,
    })),
  ];
}

function template(input: {
  index: number;
  name: string;
  direction: 'IN' | 'OUT';
  amount: number;
  dueDayOfMonth: number;
  isEstimate: boolean;
  startMonth: string;
}): SetupTemplate {
  return {
    id: `tpl-${String(input.index + 1)}`,
    name: input.name,
    direction: input.direction,
    dueDayOfMonth: input.dueDayOfMonth,
    amount: input.amount,
    startMonth: input.startMonth,
    endMonth: null,
    status: 'ACTIVE',
    isEstimate: input.isEstimate,
    valueSchedule: [],
  };
}

/**
 * Every bucket opens empty. The conversation never asks what is already in
 * one, and a balance nobody stated would be a correction with nothing behind
 * it — the exact bug UC-6.7's event log exists to prevent.
 */
function composeBucket(bucket: DraftBucket, index: number): SetupBucket {
  return {
    id: `bkt-${String(index + 1)}`,
    name: bucket.name,
    purpose: '',
    mode: bucket.mode,
    status: 'ACTIVE',
    priority: bucket.priority,
    target:
      bucket.mode === 'GOAL'
        ? {
            amount: bucket.target.amount.cents,
            date: bucket.target.date.toISO(),
          }
        : null,
    rule:
      bucket.rule.kind === 'PERCENT'
        ? { kind: 'PERCENT', basisPoints: bucket.rule.percentage.basisPoints }
        : { kind: 'FIXED', amount: bucket.rule.amount.cents },
    expectedYieldBasisPoints: null,
    events: [],
  };
}

/**
 * UC-1.5 — the end of the conversation: nothing the user said has touched the
 * database until this runs, and then all of it does at once, through the same
 * restore a backup file goes through (UC-1.6).
 */
export class CompleteSetup {
  constructor(
    private readonly conversations: SetupConversations,
    private readonly write: WriteSetupDocument,
    private readonly clock: Clock,
  ) {}

  async execute(conversationId: string): Promise<SetupDocument> {
    const stored = await this.conversations.load(conversationId);
    if (stored === undefined) {
      throw new SetupConversationNotFound(
        `Não existe nenhuma conversa de configuração chamada "${conversationId}".`,
      );
    }

    const document = composeSetup(
      stored.state.draft,
      this.clock.now().toISOString(),
    );
    await this.write.write(document);

    return document;
  }
}
