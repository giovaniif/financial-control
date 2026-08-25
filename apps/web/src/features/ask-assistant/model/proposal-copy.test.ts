import type { ProposalKind } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import {
  describeCycle,
  describeProposal,
  inAppTerms,
} from './proposal-copy.js';

const KINDS: ProposalKind[] = [
  'SETTLE_ENTRY',
  'ADD_ENTRY',
  'CREATE_TEMPLATE',
  'CHANGE_TEMPLATE_AMOUNT',
  'CHANGE_PAYDAY_ANCHOR',
  'CREATE_GOAL_BUCKET',
  'CREATE_ONGOING_BUCKET',
  'CHANGE_ALLOCATION_RULE',
  'OVERRIDE_CONTRIBUTION',
];

describe('proposal copy', () => {
  it.each(KINDS)('names what %s would do', (kind) => {
    expect(describeProposal(kind).label).not.toBe('');
  });

  /**
   * UC-8.3 — a proposal is shown as what it will do, naming the cycle it
   * lands in. A bare month key is the thing the user misreads.
   */
  it('names the cycle a settlement lands in', () => {
    expect(
      describeCycle(
        'SETTLE_ENTRY',
        'Settle entry e1 in the 2026-09 cycle as paid, at its planned amount.',
      ),
    ).toBe('Dá baixa no ciclo Setembro de 2026.');
  });

  it('names the cycle an override applies to', () => {
    expect(
      describeCycle(
        'OVERRIDE_CONTRIBUTION',
        'Put R$ 500,00 into bucket b1 for the 2026-10 cycle, this once.',
      ),
    ).toBe('Vale para o ciclo Outubro de 2026.');
  });

  /**
   * A kind that lands in no single cycle keeps its note even when the
   * sentence happens to carry a month key — the note is what is true about
   * the change, and a month in the prose is not the cycle it lands in.
   */
  it('keeps the note for a kind that names no cycle, month or not', () => {
    expect(
      describeCycle(
        'CHANGE_ALLOCATION_RULE',
        'Mudar a caixinha 2026-09 para receber 20% por ciclo.',
      ),
    ).toBe('Muda o que cada ciclo aloca a partir de agora.');
  });

  it('falls back to what a template does when it names no start cycle', () => {
    expect(
      describeCycle(
        'CREATE_TEMPLATE',
        'Create the recurring outcome “Dentist” of R$ 300,00 on day 20, from the current cycle.',
      ),
    ).toBe('Gera um lançamento a partir do ciclo atual em diante.');
  });

  it('reads dates and cycles the way the rest of the app does', () => {
    expect(
      inAppTerms(
        'Add “Dentist” to the 2026-09 cycle — a fixed of R$ 300,00 due on 2026-09-20.',
      ),
    ).toBe(
      'Add “Dentist” to the Setembro de 2026 cycle — a fixed of R$ 300,00 due on 20/09/2026.',
    );
  });
});
