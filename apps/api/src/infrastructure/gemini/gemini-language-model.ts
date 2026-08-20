import type {
  JsonObject,
  JsonValue,
  LanguageModel,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelStopReason,
  ModelStreamEvent,
  ModelUsage,
  ToolCall,
  ToolDeclaration,
} from '../../domain/ports/language-model.js';
import { LanguageModelFailed } from '../../domain/ports/language-model.js';

/**
 * The slice of Gemini's HTTP API this adapter uses — `generateContent`, once
 * whole and once as a stream. Narrow on purpose: it is the seam a test stands
 * in for, so the mapping is provable without a key or a network.
 */
export interface GeminiTransport {
  send(model: string, request: GeminiRequest): Promise<GeminiReply>;
  stream(model: string, request: GeminiRequest): AsyncIterable<GeminiReply>;
}

export interface GeminiRequest {
  readonly systemInstruction: { readonly parts: readonly GeminiPart[] };
  readonly contents: readonly GeminiContent[];
  /** Absent rather than empty: Gemini rejects a declaration list with none. */
  readonly tools?: readonly GeminiTool[];
  readonly generationConfig: { readonly maxOutputTokens: number };
}

export interface GeminiContent {
  readonly role: 'user' | 'model';
  readonly parts: readonly GeminiPart[];
}

export interface GeminiPart {
  readonly text?: string;
  /** Stamped on a call by the model, and required back with it. */
  readonly thoughtSignature?: string;
  readonly functionCall?: {
    readonly id?: string;
    readonly name: string;
    readonly args?: JsonObject;
  };
  readonly functionResponse?: {
    readonly name: string;
    readonly response: JsonObject;
  };
}

export interface GeminiTool {
  readonly functionDeclarations: readonly {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonObject;
  }[];
}

/** One whole reply, and — the shapes being identical — one line of a stream. */
export interface GeminiReply {
  readonly candidates?: readonly {
    readonly content?: {
      readonly role?: string;
      readonly parts?: readonly GeminiPart[];
    };
    readonly finishReason?: string;
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly thoughtsTokenCount?: number;
  };
}

/** Which Gemini model answers, and how much it may write. */
export interface GeminiChoice {
  readonly model: string;
  readonly maxTokens: number;
  readonly maxTokensStreaming: number;
}

/**
 * The `LanguageModel` port against Gemini — FIN-133.
 *
 * The third implementation of a port that already existed, and the one the
 * app actually runs on: the Anthropic key has no balance and a 7B local model
 * garbles roughly one extraction in five. Nothing above the port knows any of
 * that changed.
 */
export class GeminiLanguageModel implements LanguageModel {
  readonly isAvailable = true;

  constructor(
    private readonly transport: GeminiTransport,
    private readonly choice: GeminiChoice,
  ) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const reply = await this.transport
      .send(this.choice.model, this.requestFrom(request, false))
      .catch(rethrowAsDomainError);

    return toModelResponse([reply]);
  }

  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const replies = this.transport.stream(
      this.choice.model,
      this.requestFrom(request, true),
    );

    return (async function* emit(): AsyncGenerator<ModelStreamEvent> {
      const seen: GeminiReply[] = [];

      try {
        for await (const reply of replies) {
          seen.push(reply);
          for (const part of partsOf(reply)) {
            const delta = part.text ?? '';
            if (delta !== '') yield { kind: 'text', delta };
          }
        }
      } catch (cause) {
        rethrowAsDomainError(cause);
      }

      // The port's order, matching the other two adapters: the prose as it
      // arrives, then the calls, then one response carrying both.
      const response = toModelResponse(seen);
      for (const call of response.toolCalls) {
        yield { kind: 'toolCall', call };
      }
      yield { kind: 'done', response };
    })();
  }

  private requestFrom(
    request: ModelRequest,
    streaming: boolean,
  ): GeminiRequest {
    const tools = request.tools.map(toFunctionDeclaration);

    return {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: toContents(request),
      ...(tools.length === 0
        ? {}
        : { tools: [{ functionDeclarations: tools }] }),
      generationConfig: {
        maxOutputTokens: streaming
          ? this.choice.maxTokensStreaming
          : this.choice.maxTokens,
      },
    };
  }
}

function toFunctionDeclaration(tool: ToolDeclaration) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.inputSchema),
  };
}

/**
 * Gemini's `parameters` is an OpenAPI subset, and it rejects a field name it
 * does not know rather than ignoring it — `additionalProperties`, which
 * strict tool use elsewhere wants, is a 400. An allow-list rather than a
 * deny-list: a keyword nobody thought about is then dropped, which costs a
 * constraint, where passing it on costs the whole call.
 */
const SUPPORTED_KEYWORDS = new Set([
  'type',
  'format',
  'description',
  'nullable',
  'enum',
  'items',
  'properties',
  'required',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'anyOf',
]);

function toGeminiSchema(schema: JsonObject): JsonObject {
  const kept: JsonObject = {};

  for (const [keyword, value] of Object.entries(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) continue;

    if (keyword === 'properties' && isJsonObject(value)) {
      kept[keyword] = Object.fromEntries(
        Object.entries(value).map(([field, shape]) => [
          field,
          isJsonObject(shape) ? toGeminiSchema(shape) : shape,
        ]),
      );
      continue;
    }

    kept[keyword] =
      keyword === 'items' && isJsonObject(value)
        ? toGeminiSchema(value)
        : value;
  }

  return kept;
}

/**
 * The system prompt is a field of its own here rather than a message, and a
 * tool result is a user turn rather than one of its own — the two places this
 * shape differs from the Messages API.
 *
 * Gemini names the tool a result answers, where the port correlates by call
 * id. The names are recovered from the assistant turns in this same request,
 * which is where the ids were handed out.
 */
function toContents(request: ModelRequest): GeminiContent[] {
  const toolNames = new Map<string, string>();
  for (const message of request.messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls) {
        toolNames.set(call.id, call.name);
      }
    }
  }

  return request.messages.map((message) => toContent(message, toolNames));
}

function toContent(
  message: ModelMessage,
  toolNames: ReadonlyMap<string, string>,
): GeminiContent {
  switch (message.role) {
    case 'user':
      return { role: 'user', parts: [{ text: message.text }] };

    case 'assistant':
      return {
        role: 'model',
        parts: [
          ...(message.text === '' ? [] : [{ text: message.text }]),
          ...message.toolCalls.map((call) => ({
            functionCall: { name: call.name, args: call.arguments },
            // Without it the whole transcript is rejected, so a call that
            // arrived with one always goes back with it.
            ...(call.continuation === undefined
              ? {}
              : { thoughtSignature: call.continuation }),
          })),
        ],
      };

    case 'toolResults':
      return {
        role: 'user',
        parts: message.results.map((result) => ({
          functionResponse: {
            name: toolNames.get(result.callId) ?? result.callId,
            // Gemini has no failed-result flag, so which key carries the text
            // is what says the call did not work.
            response: result.isError
              ? { error: result.content }
              : { result: result.content },
          },
        })),
      };
  }
}

function toModelResponse(replies: readonly GeminiReply[]): ModelResponse {
  const parts = replies.flatMap(partsOf);

  const toolCalls = parts
    .filter((part) => part.functionCall !== undefined)
    .map((part, index): ToolCall => {
      const call = part.functionCall;
      return {
        id: call?.id ?? `call_${String(index)}`,
        name: call?.name ?? '',
        arguments: call?.args ?? {},
        ...(part.thoughtSignature === undefined
          ? {}
          : { continuation: part.thoughtSignature }),
      };
    });

  return {
    text: parts.map((part) => part.text ?? '').join(''),
    toolCalls,
    stopReason: toStopReason(finishReasonOf(replies), toolCalls.length > 0),
    usage: toUsage(replies),
  };
}

function partsOf(reply: GeminiReply): readonly GeminiPart[] {
  return reply.candidates?.[0]?.content?.parts ?? [];
}

function finishReasonOf(replies: readonly GeminiReply[]): string | undefined {
  for (const reply of [...replies].reverse()) {
    const reason = reply.candidates?.[0]?.finishReason;
    if (reason !== undefined) return reason;
  }
  return undefined;
}

/**
 * Reasoning is billed as output and counted apart from the answer, so a total
 * that reads only `candidatesTokenCount` under-reports what the day cost.
 */
function toUsage(replies: readonly GeminiReply[]): ModelUsage {
  const counted = [...replies]
    .reverse()
    .find((reply) => reply.usageMetadata !== undefined)?.usageMetadata;

  return {
    inputTokens: counted?.promptTokenCount ?? 0,
    outputTokens:
      (counted?.candidatesTokenCount ?? 0) + (counted?.thoughtsTokenCount ?? 0),
  };
}

/**
 * Gemini finishes a tool-calling turn with the same `STOP` it gives plain
 * prose, so the calls themselves are what say the turn is unfinished — as in
 * the Ollama adapter, and unlike the Messages API.
 */
function toStopReason(
  reason: string | undefined,
  calledTools: boolean,
): ModelStopReason {
  if (calledTools) return 'toolCalls';
  if (reason === 'MAX_TOKENS') return 'maxTokens';
  return reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT'
    ? 'refusal'
    : 'end';
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rethrowAsDomainError(cause: unknown): never {
  throw new LanguageModelFailed(
    cause instanceof Error ? cause.message : 'A chamada ao modelo falhou.',
  );
}
