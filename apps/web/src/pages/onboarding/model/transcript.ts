import type {
  EstablishedRecordResponse,
  SetupSection,
  SetupTurnResponse,
} from '@fin/contracts';

import { SECTION_ORDER } from './sections.js';

export type Entry =
  | { kind: 'assistant' | 'user' | 'correction'; text: string }
  | ({ kind: 'record' } & EstablishedRecordResponse);

/**
 * The server cannot say the first line — it answers a message, and there is
 * none yet — so the conversation opens on the section that always comes first.
 */
export const OPENING: Entry = {
  kind: 'assistant',
  text: "Let's start with the payday cycle. Which day of the month are you paid, and when that day falls on a weekend or a holiday, should the money land before it or after?",
};

/**
 * A turn folded into the transcript. The conversational route and the
 * structured correction routes answer with the same shape on purpose, so an
 * inline edit reads as one more thing that happened rather than as a second
 * kind of event: a corrected record is rewritten where it already sits, a
 * dropped one disappears, and the reply lands at the bottom either way.
 */
export function applyTurn(
  response: SetupTurnResponse,
): (current: Entry[]) => Entry[] {
  const removed = new Set(response.removed);
  const corrected = new Map(
    response.established
      .filter((record) => record.id !== null)
      .map((record) => [record.id, record] as const),
  );

  return (current) => {
    const rewritten = new Set<string>();
    const kept: Entry[] = [];

    for (const entry of current) {
      if (entry.kind !== 'record' || entry.id === null) {
        kept.push(entry);
        continue;
      }
      if (removed.has(entry.id)) continue;

      const replacement = corrected.get(entry.id);
      if (replacement === undefined) {
        kept.push(entry);
        continue;
      }

      rewritten.add(entry.id);
      kept.push({ kind: 'record', ...replacement });
    }

    return [
      ...kept,
      ...response.established
        .filter((record) => record.id === null || !rewritten.has(record.id))
        .map((record) => ({ kind: 'record' as const, ...record })),
      ...response.corrections.map((text) => ({
        kind: 'correction' as const,
        text,
      })),
      { kind: 'assistant' as const, text: response.message },
    ];
  };
}

export interface DraftSection {
  section: SetupSection;
  records: EstablishedRecordResponse[];
}

/**
 * The draft as it now stands, in the order the conversation asks in — what the
 * final review reads back. A section holding a single value is answered again
 * rather than corrected, so the transcript keeps every reading of it and only
 * the last one is still true.
 */
export function draftSections(entries: Entry[]): DraftSection[] {
  const live = new Map<string, EstablishedRecordResponse>();

  for (const entry of entries) {
    if (entry.kind === 'record') {
      live.set(entry.id ?? entry.section, entry);
    }
  }

  const records = [...live.values()];

  return SECTION_ORDER.map((section) => ({
    section,
    records: records.filter((record) => record.section === section),
  })).filter(({ records: held }) => held.length > 0);
}
