import type { Principal } from '../shared/principal.js';

import type { ModelMessage } from './language-model.js';

/**
 * One assistant conversation, as the server holds it.
 *
 * **The transcript never round-trips through the client.** A caller that
 * carried it would decide how many input tokens every question costs, and
 * could hand the model assistant turns and tool results that never happened —
 * figures the user would then be answered from. Holding it here removes both
 * at the root rather than capping them after the fact.
 *
 * The principal is stored because a conversation outlives the request that
 * opened it, exactly as a proposal does: identity has to be stamped on now,
 * not added the day there is a second user.
 */
export interface StoredAssistantConversation {
  readonly id: string;
  readonly principal: Principal;
  readonly transcript: readonly ModelMessage[];
}

export interface AssistantConversationStore {
  load(id: string): Promise<StoredAssistantConversation | undefined>;
  save(conversation: StoredAssistantConversation): Promise<void>;
}
