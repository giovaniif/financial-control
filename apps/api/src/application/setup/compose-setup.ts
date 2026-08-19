import type {
  BackupBucket,
  BackupCard,
  BackupDocument,
  BackupTemplate,
} from '@fin/contracts';
import { BACKUP_VERSION } from '@fin/contracts';

import type { Clock } from '../../domain/ports/clock.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { BackupRestore } from '../backup/uc-1-6-backup-restore.js';

import type { DraftBill, DraftBucket, SetupDraft } from './setup-draft.js';
import type { SetupConversations } from './uc-1-5-converse-setup.js';
import { SetupConversationNotFound } from './uc-1-5-converse-setup.js';

export class SetupNotComplete extends DomainError {}

const SALARY = 'Salary';

/**
 * UC-1.5 — a finished setup conversation as a v1 backup document.
 *
 * **Templates rather than materialised cycles.** The app generates a cycle
 * from its templates, lazily and idempotently, so writing cycles here would
 * duplicate the engine and hand-chain every opening balance.
 *
 * Nothing arithmetic happens on the way through: the draft has already
 * validated every record and normalised every sign. What is left is a
 * mapping, plus the ids the draft deliberately does not carry — a card names
 * the account that pays it, and this is where that name becomes an id.
 */
export function composeSetup(
  draft: SetupDraft,
  exportedAt: string,
): BackupDocument {
  const anchor = draft.anchor;
  if (!draft.isComplete || anchor === undefined) {
    throw new SetupNotComplete(
      `The setup still has to answer: ${draft.remainingSections.join(', ')}.`,
    );
  }

  const accounts = draft.accounts.map((account, index) => ({
    id: `acc-${String(index + 1)}`,
    name: account.name,
    type: account.type,
    balance: account.balance.cents,
  }));

  return {
    version: BACKUP_VERSION,
    exportedAt,
    anchor: { anchorDay: anchor.dayOfMonth, shiftPolicy: anchor.shiftPolicy },
    accounts,
    cycles: [],
    templates: composeTemplates(draft),
    cards: composeCards(draft, accounts),
    buckets: draft.buckets.map(composeBucket),
  };
}

function composeTemplates(draft: SetupDraft): BackupTemplate[] {
  const salary = draft.salary;
  const bills = [...draft.fixedBills, ...draft.variableBills];

  // The salary is dated by the payday anchor and never by an answer of its
  // own: a second answer could only disagree with the cycle boundary. UC-2.2.
  const salaryTemplate =
    salary === undefined || draft.salaryDueDayOfMonth === undefined
      ? []
      : [
          template({
            index: 0,
            name: SALARY,
            direction: 'IN' as const,
            amount: salary.cents,
            dueDayOfMonth: draft.salaryDueDayOfMonth,
            isEstimate: false,
            startMonth: draft.startMonth,
          }),
        ];

  return [
    ...salaryTemplate,
    ...bills.map((bill: DraftBill, index) =>
      template({
        index: salaryTemplate.length + index,
        name: bill.name,
        direction: 'OUT' as const,
        amount: bill.amount.cents,
        dueDayOfMonth: bill.dueDayOfMonth,
        isEstimate: bill.isEstimate,
        startMonth: draft.startMonth,
      }),
    ),
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
}): BackupTemplate {
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
 * The cards themselves, with no invoices: a conversation produces a snapshot
 * of what is set up, never a history of purchases nobody described.
 */
function composeCards(
  draft: SetupDraft,
  accounts: readonly { id: string; name: string }[],
): BackupCard[] {
  const idByName = new Map(
    accounts.map((account) => [account.name.toLowerCase(), account.id]),
  );

  return draft.cards.flatMap((card, index) => {
    // The draft refuses a card paid from an account it does not hold, so a
    // miss here is impossible rather than tolerated.
    const paymentAccountId = idByName.get(
      card.paymentAccountName.toLowerCase(),
    );

    return paymentAccountId === undefined
      ? []
      : [
          {
            id: `card-${String(index + 1)}`,
            name: card.name,
            limit: card.limit.cents,
            closingDay: card.closingDay,
            dueDay: card.dueDay,
            paymentAccountId,
            invoices: [],
            plans: [],
          },
        ];
  });
}

/**
 * Every bucket opens empty. The conversation never asks what is already in
 * one, and a balance nobody stated would be a correction with nothing behind
 * it — the exact bug UC-6.7's event log exists to prevent.
 */
function composeBucket(bucket: DraftBucket, index: number): BackupBucket {
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
    private readonly backup: BackupRestore,
    private readonly clock: Clock,
  ) {}

  async execute(conversationId: string): Promise<BackupDocument> {
    const stored = await this.conversations.load(conversationId);
    if (stored === undefined) {
      throw new SetupConversationNotFound(
        `There is no setup conversation called "${conversationId}".`,
      );
    }

    const document = composeSetup(
      stored.state.draft,
      this.clock.now().toISOString(),
    );
    await this.backup.restore(document);

    return document;
  }
}
