import type {
  AssistantConversationStore,
  StoredAssistantConversation,
} from '../../domain/ports/assistant-conversation-store.js';
import type { IdSource } from '../../domain/ports/id-source.js';
import { DomainError } from '../../domain/shared/domain-error.js';
import type { Principal } from '../../domain/shared/principal.js';

import type {
  AskAssistant,
  AssistantAnswer,
  AssistantEvent,
} from './uc-8-ask-assistant.js';

export class AssistantConversationNotFound extends DomainError {}
export class QuestionTooLong extends DomainError {}
export class ConversationTooLong extends DomainError {}

export type AssistantConversations = AssistantConversationStore;

/**
 * What one request to the assistant may cost.
 *
 * Injected rather than read here so the whole cost surface — which model
 * answers, how many output tokens it may write, how long a question may be
 * and how long a conversation may run — sits in one place beside the model
 * choices (`infrastructure/anthropic/models.ts`).
 */
export interface AssistantLimits {
  /** Of the message the user typed, after trimming. */
  readonly maxQuestionCharacters: number;
  /** Counted from the transcript the server holds, never from the client. */
  readonly maxTurnsPerConversation: number;
  /** Batches of tool calls one question may run. Enforced by AskAssistant. */
  readonly maxToolRoundTrips: number;
}

/**
 * One turn of a held conversation: the same events a question produces, and
 * the finished answer last with the id the next turn is continued by.
 */
export type AssistantTurnEvent =
  | Exclude<AssistantEvent, { kind: 'answer' }>
  | {
      readonly kind: 'turn';
      readonly conversationId: string;
      readonly answer: AssistantAnswer;
    };

/**
 * UC-8.1 — the conversation the assistant answers in, held by the server.
 *
 * It exists so that a question and the history behind it are two different
 * things: the client sends one message and an id, and the transcript that
 * message is answered against never leaves this machine. That is what makes
 * the cost of a turn something the app decides rather than the caller.
 *
 * **Every cap is a rejection, never a truncation.** Silently dropping half a
 * transcript, or half a question, would leave the assistant answering from a
 * history the user cannot see and has no way to notice.
 */
export class AssistantConversation {
  constructor(
    private readonly assistant: AskAssistant,
    private readonly conversations: AssistantConversations,
    private readonly ids: IdSource,
    private readonly limits: AssistantLimits,
  ) {}

  get isAvailable(): boolean {
    return this.assistant.isAvailable;
  }

  /**
   * The principal is a separate argument from the message because identity is
   * ambient: it comes from whatever knows who is calling, never from the body
   * that was sent.
   */
  async *converse(
    principal: Principal,
    input: { conversationId?: string; message: string },
  ): AsyncGenerator<AssistantTurnEvent, void> {
    const message = input.message.trim();
    if (message.length > this.limits.maxQuestionCharacters) {
      throw new QuestionTooLong(
        `Uma pergunta pode ter ${String(this.limits.maxQuestionCharacters)} caracteres; esta tem ${String(message.length)}. Nada foi enviado ao modelo — pergunte em menos palavras, ou em mais de uma pergunta.`,
      );
    }

    const stored = await this.open(principal, input.conversationId);
    if (turnsOf(stored) >= this.limits.maxTurnsPerConversation) {
      throw new ConversationTooLong(
        `Esta conversa já teve as ${String(this.limits.maxTurnsPerConversation)} rodadas que uma conversa pode ter. Comece outra e ela lê os seus números de novo.`,
      );
    }

    for await (const event of this.assistant.converse(principal, {
      question: message,
      history: stored.transcript,
    })) {
      if (event.kind !== 'answer') {
        yield event;
        continue;
      }

      // Saved before it is announced: the id the client is handed has to name
      // a conversation that is already there to be continued.
      await this.conversations.save({
        ...stored,
        transcript: event.transcript,
      });
      yield {
        kind: 'turn',
        conversationId: stored.id,
        answer: event.answer,
      };
    }
  }

  private async open(
    principal: Principal,
    id: string | undefined,
  ): Promise<StoredAssistantConversation> {
    if (id === undefined) {
      return { id: this.ids.next(), principal, transcript: [] };
    }

    const stored = await this.conversations.load(id);
    // A conversation of somebody else's is answered exactly as one that does
    // not exist: whose it is, is not something a caller gets to learn.
    if (stored?.principal.equals(principal) !== true) {
      throw new AssistantConversationNotFound(
        `Não existe nenhuma conversa chamada "${id}".`,
      );
    }
    return stored;
  }
}

/** What the user has asked so far, counted where the client cannot reach. */
function turnsOf(stored: StoredAssistantConversation): number {
  return stored.transcript.filter((message) => message.role === 'user').length;
}
