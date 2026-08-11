import type { Cycle } from './cycle.js';
import { LedgerEntry, Origin } from './ledger-entry.js';
import type { RecurringTemplate } from './recurring-template.js';

/** A template that could not be placed, and why. */
export interface UngeneratedTemplate {
  readonly templateId: string;
  readonly name: string;
  readonly reason: 'DUE_DAY_OUTSIDE_CYCLE';
}

export interface GenerationResult {
  readonly cycle: Cycle;
  readonly added: readonly LedgerEntry[];
  readonly skipped: readonly UngeneratedTemplate[];
}

/**
 * Fills a cycle from the templates that apply to it.
 *
 * **Lazy and idempotent.** An entry is keyed by the template that produced it,
 * so re-running adds nothing the second time. Crucially, an entry already
 * present is left exactly as it is — including one the user has settled or
 * overridden. Regeneration must never quietly undo a decision the user made.
 *
 * A template whose due day falls in neither month the cycle spans is reported
 * rather than forced onto a boundary: silently moving a bill's date would put
 * it in a cycle the user did not expect.
 */
export function generateInto(
  cycle: Cycle,
  templates: readonly RecurringTemplate[],
  newId: (templateId: string, month: string) => string,
): GenerationResult {
  const alreadyGenerated = new Set(
    cycle.entries.flatMap((entry) => templateIdOf(entry)),
  );

  const added: LedgerEntry[] = [];
  const skipped: UngeneratedTemplate[] = [];
  let filled = cycle;

  for (const template of templates) {
    if (!template.appliesTo(cycle.ref) || alreadyGenerated.has(template.id)) {
      continue;
    }

    const dueDate = template.dueDateIn(cycle.ref);
    if (dueDate === undefined) {
      skipped.push({
        templateId: template.id,
        name: template.name,
        reason: 'DUE_DAY_OUTSIDE_CYCLE',
      });
      continue;
    }

    const entry = LedgerEntry.create({
      id: newId(template.id, cycle.ref.month),
      description: template.name,
      kind: template.entryKind,
      dueDate,
      planned: template.amountFor(cycle.ref),
      isEstimate: template.isEstimate,
      origin: Origin.fromTemplate(template.id),
    });

    filled = filled.addEntry(entry);
    added.push(entry);
  }

  return { cycle: filled, added, skipped };
}

/**
 * The template behind an entry, looking through an override — an overridden
 * entry is still that template's entry, so regenerating must not add a second.
 */
function templateIdOf(entry: LedgerEntry): string[] {
  const origin =
    entry.origin.kind === 'OVERRIDE' ? entry.origin.original : entry.origin;

  return origin.kind === 'FROM_TEMPLATE' ? [origin.templateId] : [];
}
