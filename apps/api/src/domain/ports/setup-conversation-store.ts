import type { ModelMessage } from './language-model.js';

/**
 * One setup conversation, as the server holds it.
 *
 * **The transcript never round-trips through the client.** A caller that
 * carried it would decide how many input tokens each request costs us, and
 * could hand the model assistant turns and tool results that never happened.
 * Holding it here removes both at the root rather than capping them after the
 * fact.
 *
 * `state` — the draft and wherever the conversation has got to — and
 * `records` are the caller's types: the store is the mechanism, and what a
 * setup conversation accumulates is a question for the layer running it, not
 * for the domain.
 */
export interface StoredSetupConversation<TState, TRecord> {
  readonly id: string;
  readonly transcript: readonly ModelMessage[];
  readonly state: TState;
  /** Everything extracted so far. Nothing is persisted until it is applied. */
  readonly records: readonly TRecord[];
}

export interface SetupConversationStore<TState, TRecord> {
  load(
    id: string,
  ): Promise<StoredSetupConversation<TState, TRecord> | undefined>;
  save(conversation: StoredSetupConversation<TState, TRecord>): Promise<void>;
}
