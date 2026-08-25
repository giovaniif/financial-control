/**
 * UC-8 — the assistant.
 *
 * One message in, one stream out. The transcript is not here on purpose: the
 * server holds it and the client carries only the id it was handed back, so
 * how many input tokens a question costs is never the caller's decision and
 * no caller can show the model a turn that never happened.
 */
export interface AssistantMessageRequest {
  message: string;
  /** Absent on the first message, the previous turn's id on every one after. */
  conversationId?: string;
}

/** One tool the assistant ran, so the UI can say what it was doing. */
export interface AssistantReadResponse {
  tool: string;
  /** Why the call produced nothing, or `null` when it produced something. */
  failure: string | null;
}

/** Every change the assistant can offer. It offers; it never applies. */
export type ProposalKind =
  | 'SETTLE_ENTRY'
  | 'ADD_ENTRY'
  | 'CREATE_TEMPLATE'
  | 'CHANGE_TEMPLATE_AMOUNT'
  | 'CHANGE_PAYDAY_ANCHOR'
  | 'CREATE_GOAL_BUCKET'
  | 'CREATE_ONGOING_BUCKET'
  | 'CHANGE_ALLOCATION_RULE'
  | 'OVERRIDE_CONTRIBUTION';

/**
 * A change waiting on the user. What it would write stays on the server —
 * the client renders the sentence and confirms it by id and by that same
 * sentence, so a proposal cannot be swapped between being read and applied.
 */
export interface AssistantProposalResponse {
  id: string;
  kind: ProposalKind;
  summary: string;
  /** ISO-8601 instant. */
  proposedAt: string;
}

/** The finished turn — the terminal event of the stream. */
export interface AssistantTurnResponse {
  conversationId: string;
  message: string;
  reads: AssistantReadResponse[];
  proposals: AssistantProposalResponse[];
  /** The model declined — a well-formed answer, not a failure. */
  wasRefused: boolean;
  /** The turn ran out of the reads one question may make, and says so. */
  hitReadLimit: boolean;
}

/**
 * What arrives on `POST /assistant/messages`, as server-sent events. Each
 * frame is `event: <event>` followed by `data: <the JSON below>`.
 *
 * `turn` is terminal and carries the whole answer, proposals included. `error`
 * is terminal too and only ever appears once the response has already begun:
 * anything that fails before the first token is a status code instead.
 */
export type AssistantStreamEvent =
  | { event: 'text'; data: { delta: string } }
  | { event: 'tool'; data: AssistantReadResponse }
  | { event: 'turn'; data: AssistantTurnResponse }
  | { event: 'error'; data: AssistantStreamError };

export interface AssistantStreamError {
  error: string;
  /** The status this would have been, had the headers not already gone out. */
  status: number;
}

/**
 * The user saying yes to one proposal. It carries the sentence they were
 * shown, word for word, and nothing else of the change.
 */
export interface ProposalConfirmationRequest {
  summary: string;
}

export interface ProposalAppliedResponse {
  proposalId: string;
  kind: ProposalKind;
  summary: string;
}
