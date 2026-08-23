import type { ProposalKind } from '@fin/contracts';

import { formatDate, formatMonthLabel } from '@/shared/lib';

/** How one kind of proposal is read: what it does, and how it meets a cycle. */
export interface ProposalCopy {
  readonly label: string;
  /**
   * Reads before the cycle's name when the proposal states one — `null` for a
   * change that never lands in a single cycle.
   */
  readonly cycleLead: string | null;
  /** What to say instead when the sentence names no cycle. */
  readonly cycleNote: string | null;
}

/**
 * Every kind, described in the app's own vocabulary. The `never` default is
 * load-bearing: a kind added to the contract has to be given a rendering here
 * or the build breaks, rather than reaching the screen as a bare enum name.
 */
export function describeProposal(kind: ProposalKind): ProposalCopy {
  switch (kind) {
    case 'SETTLE_ENTRY':
      return {
        label: 'Settle an entry',
        cycleLead: 'Settles in the',
        cycleNote: null,
      };
    case 'ADD_ENTRY':
      return {
        label: 'Add an entry',
        cycleLead: 'Lands in the',
        cycleNote: null,
      };
    case 'REGISTER_PURCHASE':
      return {
        label: 'Register a purchase',
        cycleLead: null,
        // UC-5.4 — the due date decides, so a purchase one day after closing
        // is paid a whole cycle later.
        cycleNote:
          'The invoice this is billed on decides the cycle it lands in, not the date it was bought.',
      };
    case 'CREATE_TEMPLATE':
      return {
        label: 'Create a recurring entry',
        cycleLead: 'Generates an entry from the',
        cycleNote: 'Generates an entry from the current cycle onward.',
      };
    case 'CHANGE_TEMPLATE_AMOUNT':
      return {
        label: 'Change a recurring amount',
        cycleLead: 'Applies from the',
        cycleNote: null,
      };
    case 'CHANGE_PAYDAY_ANCHOR':
      return {
        label: 'Move the payday anchor',
        cycleLead: null,
        cycleNote:
          'Re-slices every open cycle, so entries can move from one cycle to another.',
      };
    case 'CREATE_GOAL_BUCKET':
      return {
        label: 'Create a goal bucket',
        cycleLead: null,
        cycleNote: 'Takes from Expected Surplus in every cycle from now on.',
      };
    case 'CREATE_ONGOING_BUCKET':
      return {
        label: 'Create an ongoing bucket',
        cycleLead: null,
        cycleNote: 'Takes from Expected Surplus in every cycle from now on.',
      };
    case 'CHANGE_ALLOCATION_RULE':
      return {
        label: 'Change an allocation rule',
        cycleLead: null,
        cycleNote: 'Changes what every cycle allocates from now on.',
      };
    case 'OVERRIDE_CONTRIBUTION':
      return {
        label: 'Override one contribution',
        cycleLead: 'Applies to the',
        cycleNote: null,
      };
    default: {
      const unhandled: never = kind;
      throw new Error(`No rendering for proposal ${String(unhandled)}.`);
    }
  }
}

/**
 * The cycle line under a proposal — UC-8.3 asks for the cycle by name, and a
 * `2026-09` in a sentence is exactly what a reader mistakes for September's
 * calendar month.
 */
export function describeCycle(
  kind: ProposalKind,
  summary: string,
): string | null {
  const { cycleLead, cycleNote } = describeProposal(kind);
  const month = cycleOf(summary);

  if (month === undefined || cycleLead === null) {
    return cycleNote;
  }

  return `${cycleLead} ${formatMonthLabel(month)} cycle.`;
}

/** The cycle a summary names, as a month key, or nothing when it names none. */
export function cycleOf(summary: string): string | undefined {
  return CYCLE_MONTH.exec(summary)?.[1];
}

// A month key, but never the first seven characters of a full date.
const CYCLE_MONTH = /(\d{4}-\d{2})(?!-\d{2})/;
const ISO = /\d{4}-\d{2}(?:-\d{2})?/g;
const ISO_DAY_LENGTH = 10;

/**
 * The server writes a proposal in the domain's terms — ISO days and month
 * keys. The app shows `dd/MM/yyyy` and names a cycle for the month it is
 * spent in, so the sentence is read back the same way everywhere else is.
 */
export function inAppTerms(summary: string): string {
  return summary.replace(ISO, (token) =>
    token.length === ISO_DAY_LENGTH
      ? formatDate(token)
      : formatMonthLabel(token),
  );
}
