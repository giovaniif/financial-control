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
        label: 'Dar baixa em um lançamento',
        cycleLead: 'Dá baixa no ciclo',
        cycleNote: null,
      };
    case 'ADD_ENTRY':
      return {
        label: 'Adicionar um lançamento',
        cycleLead: 'Cai no ciclo',
        cycleNote: null,
      };
    case 'CREATE_TEMPLATE':
      return {
        label: 'Criar um lançamento recorrente',
        cycleLead: 'Gera um lançamento a partir do ciclo',
        cycleNote: 'Gera um lançamento a partir do ciclo atual em diante.',
      };
    case 'CHANGE_TEMPLATE_AMOUNT':
      return {
        label: 'Alterar um valor recorrente',
        cycleLead: 'Vale a partir do ciclo',
        cycleNote: null,
      };
    case 'CHANGE_PAYDAY_ANCHOR':
      return {
        label: 'Mudar o dia do pagamento',
        cycleLead: null,
        cycleNote:
          'Refaz o corte de todos os ciclos abertos, então lançamentos podem mudar de um ciclo para outro.',
      };
    case 'CREATE_GOAL_BUCKET':
      return {
        label: 'Criar uma caixinha de meta',
        cycleLead: null,
        cycleNote: 'Tira da Sobra Esperada em todo ciclo a partir de agora.',
      };
    case 'CREATE_ONGOING_BUCKET':
      return {
        label: 'Criar uma caixinha contínua',
        cycleLead: null,
        cycleNote: 'Tira da Sobra Esperada em todo ciclo a partir de agora.',
      };
    case 'CHANGE_ALLOCATION_RULE':
      return {
        label: 'Alterar uma regra de alocação',
        cycleLead: null,
        cycleNote: 'Muda o que cada ciclo aloca a partir de agora.',
      };
    case 'OVERRIDE_ENTRY':
      return {
        label: 'Alterar um valor só neste ciclo',
        cycleLead: 'Vale só no ciclo',
        cycleNote: null,
      };
    case 'REVERT_ENTRY_OVERRIDE':
      return {
        label: 'Voltar ao valor projetado',
        cycleLead: 'Volta ao projetado no ciclo',
        cycleNote: null,
      };
    case 'OVERRIDE_CONTRIBUTION':
      return {
        label: 'Ajustar um aporte',
        cycleLead: 'Vale para o ciclo',
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

  return `${cycleLead} ${formatMonthLabel(month)}.`;
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
