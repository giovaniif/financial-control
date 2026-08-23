import type { StoredSetupConversation } from '../../domain/ports/setup-conversation-store.js';
import { DomainError } from '../../domain/shared/domain-error.js';

import type { RecordCorrection } from './record-correction.js';
import { applyCorrection } from './record-correction.js';
import type { DraftRecord } from './setup-draft.js';
import { SetupRecordNotFound } from './setup-draft.js';
import type {
  EstablishedRecord,
  SetupConversations,
  SetupState,
  SetupTurn,
} from './uc-1-5-converse-setup.js';
import {
  accumulate,
  SetupConversationNotFound,
  withSomethingLeftToAsk,
} from './uc-1-5-converse-setup.js';

/** A correction that states nothing applying to the record it names. */
export class NothingToCorrect extends DomainError {}

/**
 * UC-1.5 — an inline edit of a record the setup conversation established.
 *
 * **There is no model here, and that is the point.** The conversational
 * `correct_record` tool exists for prose — *"actually the health plan is
 * 350"* — which is genuinely a language problem. A form the user has already
 * filled in is not: the record, the field and the value are all named, and
 * paying for a model call to read them back would be latency and spend on an
 * operation with no ambiguity in it, on the very flow that exists to fix the
 * model's mistakes.
 *
 * What is shared with the conversational path is everything that matters:
 * {@link applyCorrection} merges the change, {@link SetupDraft} validates it,
 * and the transcript is appended to either way — so the two paths cannot
 * accept different records, and the conversation never silently diverges from
 * what the user can see on screen.
 */
export class CorrectSetupRecord {
  constructor(private readonly conversations: SetupConversations) {}

  async correct(input: {
    conversationId: string;
    recordId: string;
    correction: RecordCorrection;
  }): Promise<SetupTurn> {
    const stored = await this.open(input.conversationId);
    const held = locate(stored.state, input.recordId);

    const corrected = applyCorrection(
      stored.state.draft,
      input.recordId,
      held,
      input.correction,
    );
    if (corrected === undefined) {
      throw new NothingToCorrect(
        `Nothing that applies to ${held.record.name} was given, so nothing changed.`,
      );
    }

    // The cursor stays where it is: the record corrected may belong to a
    // section already settled, and going back to it would restart the
    // conversation the edit is meant to fit into.
    const state: SetupState = { ...stored.state, draft: corrected.draft };
    const established: EstablishedRecord = {
      section: held.section,
      id: input.recordId,
      summary: corrected.summary,
    };

    await this.save(stored, state, `Corrected. ${corrected.summary}`, {
      established: [established],
      removed: [],
    });

    return turn(stored.id, state, {
      message: `Corrected. ${corrected.summary}`,
      established: [established],
      removed: [],
    });
  }

  async remove(input: {
    conversationId: string;
    recordId: string;
  }): Promise<SetupTurn> {
    const stored = await this.open(input.conversationId);
    const held = locate(stored.state, input.recordId);

    // Dropping the last record of a settled section leaves it unanswered
    // again — the same rule the conversational path applies.
    const state = withSomethingLeftToAsk({
      ...stored.state,
      draft: stored.state.draft.remove(input.recordId),
    });
    const message = `Dropped ${held.record.name}.`;

    await this.save(stored, state, message, {
      established: [],
      removed: [input.recordId],
    });

    return turn(stored.id, state, {
      message,
      established: [],
      removed: [input.recordId],
    });
  }

  private async open(
    id: string,
  ): Promise<StoredSetupConversation<SetupState, EstablishedRecord>> {
    const stored = await this.conversations.load(id);
    if (stored === undefined) {
      throw new SetupConversationNotFound(
        `There is no setup conversation called "${id}".`,
      );
    }
    return stored;
  }

  /**
   * The edit is written into the transcript as the user's own turn, because
   * that is what it is: the model did not do it, and a later turn answering
   * from a history missing it would contradict the records on screen.
   */
  private async save(
    stored: StoredSetupConversation<SetupState, EstablishedRecord>,
    state: SetupState,
    said: string,
    changed: {
      established: readonly EstablishedRecord[];
      removed: readonly string[];
    },
  ): Promise<void> {
    await this.conversations.save({
      id: stored.id,
      transcript: [...stored.transcript, { role: 'user', text: said }],
      state,
      records: accumulate(stored.records, changed.established, changed.removed),
    });
  }
}

function locate(state: SetupState, recordId: string): DraftRecord {
  const held = state.draft.find(recordId);
  if (held === undefined) {
    throw new SetupRecordNotFound(
      `The setup holds nothing recorded as "${recordId}".`,
    );
  }
  return held;
}

/**
 * The same shape a conversational turn answers with, so the client applies
 * one reducer to both. `corrections` and `wasRefused` belong to the model:
 * here a refusal is the request failing, not an answer.
 */
function turn(
  id: string,
  state: SetupState,
  said: {
    message: string;
    established: readonly EstablishedRecord[];
    removed: readonly string[];
  },
): SetupTurn {
  return {
    conversationId: id,
    message: said.message,
    established: said.established,
    removed: said.removed,
    corrections: [],
    nextSection: state.section,
    isComplete: state.section === undefined && state.draft.isComplete,
    wasRefused: false,
  };
}
