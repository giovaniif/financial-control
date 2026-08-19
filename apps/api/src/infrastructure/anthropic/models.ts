import type { AssistantLimits } from '../../application/assistant/assistant-conversation.js';
import { MAX_TOOL_ROUND_TRIPS } from '../../application/assistant/uc-8-ask-assistant.js';

/**
 * Which model answers, chosen per task rather than per tier.
 *
 * Opus is not here on purpose. The two things this app asks of a model are
 * not the same shape, and neither is hard enough to need the top tier:
 * extraction turns one sentence into one tool call against a strict schema,
 * and the assistant chains a few reads and explains the result. Latency is
 * the reason that matters — it is felt on every turn of a chat — though the
 * spend is lower too.
 *
 * The ceilings are sized to the task for the same reason. Extraction emits a
 * tool call and a sentence; giving it room for a book only buys the chance of
 * exceeding a smaller model's output cap.
 */
export interface ModelChoice {
  readonly id: string;
  readonly maxTokens: number;
  readonly maxTokensStreaming: number;
}

export const MODELS = {
  /** UC-1.5 — the first-run conversation. Structured extraction, nothing more. */
  extraction: {
    id: 'claude-haiku-4-5',
    maxTokens: 4_000,
    maxTokensStreaming: 4_000,
  },
  /** UC-8 — the assistant. Reads several tools and writes a real answer. */
  assistant: {
    id: 'claude-sonnet-5',
    maxTokens: 16_000,
    maxTokensStreaming: 32_000,
  },
} as const satisfies Record<string, ModelChoice>;

/**
 * What one assistant request may cost, beside the model that bills it — the
 * whole cost surface of a question in one place: which model answers, how
 * much it may write, how much may be asked of it and how long a conversation
 * may run.
 *
 * Every one of these is a **rejection**, never a truncation. Quietly dropping
 * half a transcript or half a question would leave the assistant answering
 * from a history the user cannot see and has no way to notice.
 */
export const ASSISTANT_LIMITS: AssistantLimits = {
  // A question about your own figures is a sentence or two. Past this, the
  // model is being pasted at rather than asked.
  maxQuestionCharacters: 2_000,
  // Every turn resends the whole transcript, so what a conversation costs
  // grows with its length rather than with its last message.
  maxTurnsPerConversation: 20,
  maxToolRoundTrips: MAX_TOOL_ROUND_TRIPS,
};

/**
 * How often one caller may reach a route that spends money — FIN-114.
 *
 * Here rather than in the route file because it belongs to the same question
 * as everything above: what a request to the model is allowed to cost. Two
 * windows, because they catch different things — the short one stops a hot
 * loop within a minute, and the daily one bounds the worst case even when
 * every short window is respected.
 *
 * The figures are sized to one person using the app by hand. Ten in a minute
 * is more than anybody types; two hundred in a day is ten full assistant
 * conversations at the turn cap above. Anything past either is a client
 * looping, not a user asking.
 *
 * With no authentication the key can only be the address, so this guards
 * against a runaway client and nothing else. It is not what would make the
 * app safe to expose — that is authentication, and it comes first.
 */
export const SPEND_RATE_LIMITS = {
  burst: { max: 10, windowMs: 60_000 },
  daily: { max: 200, windowMs: 24 * 60 * 60 * 1_000 },
} as const;
