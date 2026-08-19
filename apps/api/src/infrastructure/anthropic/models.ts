import type { AssistantLimits } from '../../application/assistant/assistant-conversation.js';
import { MAX_TOOL_ROUND_TRIPS } from '../../application/assistant/uc-8-ask-assistant.js';
import type { SetupLimits } from '../../application/setup/uc-1-5-converse-setup.js';

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
 * What one turn of the first-run conversation may cost — the same surface as
 * {@link ASSISTANT_LIMITS}, sized to a different shape of conversation.
 *
 * Both figures are looser than the assistant's, because the two flows are not
 * the same thing. A question to the assistant is a sentence about one figure;
 * an answer here is somebody listing what they pay for, and the conversation
 * walks seven sections rather than asking once.
 *
 * The turn cap. Anchor, accounts, salary, fixed bills, variable bills, cards
 * and buckets — and the five that hold lists are answered an item at a time,
 * so a dozen bills is a dozen turns. Sixty is several times what a first run
 * actually takes and still bounds what one conversation can spend. Nothing is
 * lost when it is reached, either: what the conversation recorded is still
 * held, to correct or to apply.
 *
 * As above, every one of these is a **rejection**, never a truncation.
 * Extracting records from half of an answer would record half a sentence as
 * fact, with nothing to show the user which half was read.
 */
export const SETUP_LIMITS: SetupLimits = {
  // An answer here legitimately lists several bills at once. Past this, the
  // model is being pasted at rather than answered.
  maxMessageCharacters: 4_000,
  maxTurnsPerConversation: 60,
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

/**
 * What the app may spend on the model in one day, in tokens — FIN-115.
 *
 * A constant, not an env var. One machine and one user, and a limit that can
 * be raised by editing an unversioned file is not a limit: raising this one is
 * a commit somebody can read.
 *
 * Prepaid credits with auto-reload off are the real backstop — nothing can
 * spend more than the balance — but that backstop has no granularity, and a
 * runaway loop that burns the whole balance in an afternoon shows up as the
 * app going dead with no explanation. This turns that into a bounded daily
 * loss with a legible message.
 *
 * The figure. A question with a full transcript behind it costs on the order
 * of 25k tokens across its calls, so a million is roughly forty of them in a
 * day — far more than one person asks by hand, and comfortably above the two
 * hundred requests {@link SPEND_RATE_LIMITS} already allows. At Sonnet 5's
 * rates a day that actually reached the ceiling costs at most about USD 15,
 * and in practice far less: input dominates, and input is a fifth the price
 * of output.
 *
 * Input and output are counted together on purpose. They are priced
 * differently, but a ceiling is only useful if it is one number a person can
 * state, and the cheaper half is the larger one here.
 */
export const DAILY_TOKEN_CEILING = 1_000_000;
