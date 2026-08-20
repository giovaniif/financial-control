import { DomainError } from '../shared/domain-error.js';

/**
 * The model, in the domain's own vocabulary. Nothing above this file knows
 * which vendor answers — one adapter under `src/infrastructure/anthropic/`
 * does, and the linter keeps it that way. The point is not vendor neutrality
 * for its own sake: it is that every interactor here can be driven by a
 * scripted fake, so no test needs a key or a network.
 */
export interface LanguageModel {
  /**
   * Whether there is a model behind this at all. The same object answers this
   * and throws {@link LanguageModelUnavailable}, so a caller that reports
   * availability up front and a caller that handles the failure can never
   * disagree about it.
   */
  readonly isAvailable: boolean;
  complete(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}

export interface ModelRequest {
  system: string;
  messages: readonly ModelMessage[];
  /** Empty when the turn is plain prose. Never absent, so callers never branch. */
  tools: readonly ToolDeclaration[];
}

/**
 * The assistant turn carries its tool calls so a conversation can be replayed
 * exactly as it happened. Dropping them and sending only the prose back would
 * leave the model answering results to calls it has no record of making.
 */
export type ModelMessage =
  | { readonly role: 'user'; readonly text: string }
  | {
      readonly role: 'assistant';
      readonly text: string;
      readonly toolCalls: readonly ToolCall[];
    }
  | { readonly role: 'toolResults'; readonly results: readonly ToolResult[] };

/**
 * A tool the model may call. `inputSchema` is enforced by the provider, which
 * is what makes a hallucinated shape a validation failure rather than a record
 * the app has to defend against later.
 */
export interface ToolDeclaration {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface ToolCall {
  /** Correlates the call with its result across the next turn. */
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
  /**
   * Opaque, and only ever handed back to the adapter that issued it. Some
   * providers stamp a call with a token and reject a transcript that replays
   * the call without it, so a conversation that outlives one request has to
   * carry it. What is inside is the adapter's business; that it survives a
   * round trip is the port's.
   */
  readonly continuation?: string;
}

export interface ToolResult {
  readonly callId: string;
  readonly content: string;
  readonly isError: boolean;
}

export interface ModelResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly stopReason: ModelStopReason;
  readonly usage: ModelUsage;
}

/**
 * What one call cost, in tokens.
 *
 * Tokens rather than money, and the port's own names rather than a provider's:
 * what a token is worth is a price list that changes, and it belongs to
 * whatever is counting rather than to the model. A caller adds these up; the
 * adapter is the only thing that knows which vendor field each came from.
 */
export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * `refusal` is a real outcome, not an error: the model may decline and still
 * answer with a well-formed response, so callers must read the reason before
 * they read the text.
 */
export type ModelStopReason = 'end' | 'toolCalls' | 'maxTokens' | 'refusal';

export type ModelStreamEvent =
  | { readonly kind: 'text'; readonly delta: string }
  | { readonly kind: 'toolCall'; readonly call: ToolCall }
  | { readonly kind: 'done'; readonly response: ModelResponse };

/**
 * Raised when no model is configured. It is a state the app is expected to be
 * in — the key is optional — so it is a typed error the UI explains rather
 * than a crash on startup.
 */
export class LanguageModelUnavailable extends DomainError {}

/**
 * Raised when the model was reachable but the call failed — a transport
 * error, a rejected request, an overloaded upstream. Typed so the interface
 * layer can map it to a status code without the domain learning about HTTP.
 */
export class LanguageModelFailed extends DomainError {}

export type JsonValue =
  string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
