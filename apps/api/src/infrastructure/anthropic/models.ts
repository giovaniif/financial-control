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
