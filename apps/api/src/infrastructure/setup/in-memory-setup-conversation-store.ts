import type {
  SetupConversationStore,
  StoredSetupConversation,
} from '../../domain/ports/setup-conversation-store.js';

/**
 * The setup conversation, held for as long as the process runs.
 *
 * Deliberately not persisted: a conversation in flight is worth exactly one
 * wizard, and an API restart mid-setup costs the user starting it again — no
 * data, because nothing a conversation holds is written until it is composed
 * and applied. A table for it would outlive its usefulness and would have to
 * be pruned by something.
 */
export class InMemorySetupConversationStore<
  TState,
  TRecord,
> implements SetupConversationStore<TState, TRecord> {
  private readonly rows = new Map<
    string,
    StoredSetupConversation<TState, TRecord>
  >();

  load(
    id: string,
  ): Promise<StoredSetupConversation<TState, TRecord> | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  save(conversation: StoredSetupConversation<TState, TRecord>): Promise<void> {
    this.rows.set(conversation.id, conversation);
    return Promise.resolve();
  }
}
