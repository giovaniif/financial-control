import type {
  AssistantConversationStore,
  StoredAssistantConversation,
} from '../../domain/ports/assistant-conversation-store.js';

/**
 * The assistant's conversations, held for as long as the process runs.
 *
 * Deliberately not persisted, as the setup conversation is not: a chat about
 * your figures is worth exactly one sitting, and an API restart costs the
 * user asking again — no data, because a conversation writes nothing. Its
 * value is perishable too, since it was answered from figures that move.
 */
export class InMemoryAssistantConversationStore implements AssistantConversationStore {
  private readonly rows = new Map<string, StoredAssistantConversation>();

  load(id: string): Promise<StoredAssistantConversation | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  save(conversation: StoredAssistantConversation): Promise<void> {
    this.rows.set(conversation.id, conversation);
    return Promise.resolve();
  }
}
