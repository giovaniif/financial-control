import type {
  AssistantProposalResponse,
  AssistantReadResponse,
} from '@fin/contracts';

const KEY = 'fin.assistant';

/** A proposal as the transcript holds it: offered, and possibly applied. */
export interface OfferedProposal {
  readonly proposal: AssistantProposalResponse;
  readonly isApplied: boolean;
}

export type TranscriptEntry =
  | { readonly kind: 'question'; readonly text: string }
  | {
      readonly kind: 'answer';
      readonly text: string;
      readonly reads: readonly AssistantReadResponse[];
      readonly proposals: readonly OfferedProposal[];
      /** The model declined — an answer, not a failure. */
      readonly wasRefused: boolean;
      readonly hitReadLimit: boolean;
    };

/**
 * The transcript the panel shows, and the id the server holds the real one
 * by. Only the id travels back: what the model was shown is never the
 * client's to decide.
 */
export interface Conversation {
  readonly conversationId: string | null;
  readonly entries: readonly TranscriptEntry[];
}

export const EMPTY_CONVERSATION: Conversation = {
  conversationId: null,
  entries: [],
};

/**
 * Kept in `localStorage` rather than in memory: a question asked yesterday is
 * still worth reading today, and there is no server route that would give the
 * transcript back — the server holds the model's copy, not the screen's.
 */
export function loadConversation(): Conversation {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');

    return isConversation(stored) ? stored : EMPTY_CONVERSATION;
  } catch {
    return EMPTY_CONVERSATION;
  }
}

export function saveConversation(conversation: Conversation): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(conversation));
  } catch {
    // A full or blocked store costs the transcript, never the conversation.
  }
}

export function withoutProposal(
  conversation: Conversation,
  proposalId: string,
): Conversation {
  return mapProposals(conversation, (proposals) =>
    proposals.filter((offered) => offered.proposal.id !== proposalId),
  );
}

export function withApplied(
  conversation: Conversation,
  proposalId: string,
): Conversation {
  return mapProposals(conversation, (proposals) =>
    proposals.map((offered) =>
      offered.proposal.id === proposalId
        ? { ...offered, isApplied: true }
        : offered,
    ),
  );
}

function mapProposals(
  conversation: Conversation,
  change: (proposals: readonly OfferedProposal[]) => OfferedProposal[],
): Conversation {
  return {
    ...conversation,
    entries: conversation.entries.map((entry) =>
      entry.kind === 'answer'
        ? { ...entry, proposals: change(entry.proposals) }
        : entry,
    ),
  };
}

function isConversation(value: unknown): value is Conversation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'entries' in value &&
    Array.isArray(value.entries)
  );
}
