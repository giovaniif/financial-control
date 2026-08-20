import type {
  JsonObject,
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
 * The slice of Ollama's HTTP API this adapter uses — `POST /api/chat`, once
 * whole and once as a stream. Narrow on purpose: it is the seam a test stands
 * in for, so the mapping is provable without a server or a model.
 */
export interface OllamaTransport {
  send(request: OllamaChatRequest): Promise<OllamaChatChunk>;
  stream(request: OllamaChatRequest): AsyncIterable<OllamaChatChunk>;
}

export interface OllamaChatRequest {
  readonly model: string;
  readonly messages: readonly OllamaMessage[];
  readonly tools: readonly OllamaTool[];
  readonly stream: boolean;
  readonly options: { readonly num_predict: number };
}

export interface OllamaMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly tool_calls?: readonly OllamaToolCall[];
  readonly tool_name?: string;
}

export interface OllamaToolCall {
  /** Absent on servers older than the one this was written against. */
  readonly id?: string;
  readonly function: {
    readonly name: string;
    readonly arguments?: JsonObject;
  };
}

export interface OllamaTool {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: JsonObject;
  };
}

/**
 * One line of the stream, and — since the shapes are identical — the whole of
 * a non-streamed reply. Everything is optional because a mid-stream line
 * carries only a fragment of it.
 */
export interface OllamaChatChunk {
  readonly message?: {
    readonly role?: string;
    readonly content?: string;
    readonly tool_calls?: readonly OllamaToolCall[];
  };
  readonly done?: boolean;
  readonly done_reason?: string;
  readonly prompt_eval_count?: number;
  readonly eval_count?: number;
}

/** Which local model answers, and how much it may write. */
export interface OllamaChoice {
  readonly model: string;
  readonly maxTokens: number;
  readonly maxTokensStreaming: number;
}

/**
 * The `LanguageModel` port against a local Ollama server — FIN-118.
 *
 * The second implementation of a port that already existed, which is the
 * whole point: nothing above it changes, so the entire AI flow can be
 * exercised for free and without limit. It is not evidence that the prompts
 * work — a 7B model's tool-calling is not Haiku's — only that our own
 * behaviour around the model does.
 */
export class OllamaLanguageModel implements LanguageModel {
  readonly isAvailable = true;

  constructor(
    private readonly transport: OllamaTransport,
    private readonly choice: OllamaChoice,
  ) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const reply = await this.transport
      .send(this.requestFrom(request, false))
      .catch(rethrowAsDomainError);

    return toModelResponse(reply, reply.message?.tool_calls ?? []);
  }

  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const chunks = this.transport.stream(this.requestFrom(request, true));

    return (async function* emit(): AsyncGenerator<ModelStreamEvent> {
      const rawCalls: OllamaToolCall[] = [];
      let text = '';
      let last: OllamaChatChunk = {};

      try {
        for await (const chunk of chunks) {
          const delta = chunk.message?.content ?? '';
          if (delta !== '') {
            text += delta;
            yield { kind: 'text', delta };
          }
          rawCalls.push(...(chunk.message?.tool_calls ?? []));
          last = chunk;
        }
      } catch (cause) {
        rethrowAsDomainError(cause);
      }

      // The port's order, matching the SDK adapter: the prose as it arrives,
      // then the calls, then one response carrying both.
      const response = toModelResponse(last, rawCalls, text);
      for (const call of response.toolCalls) {
        yield { kind: 'toolCall', call };
      }
      yield { kind: 'done', response };
    })();
  }

  private requestFrom(
    request: ModelRequest,
    streaming: boolean,
  ): OllamaChatRequest {
    return {
      model: this.choice.model,
      messages: toOllamaMessages(request),
      tools: request.tools.map(toOllamaTool),
      stream: streaming,
      options: {
        num_predict: streaming
          ? this.choice.maxTokensStreaming
          : this.choice.maxTokens,
      },
    };
  }
}

function toOllamaTool(tool: ToolDeclaration): OllamaTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

/**
 * The system prompt is a message here rather than a field of its own, and a
 * tool result is a turn of its own rather than a user turn — the two places
 * this shape differs from the Messages API.
 *
 * Ollama names the tool a result answers, where the port correlates by call
 * id. The names are recovered from the assistant turns in this same request,
 * which is where the ids were handed out.
 */
function toOllamaMessages(request: ModelRequest): OllamaMessage[] {
  const toolNames = new Map<string, string>();
  for (const message of request.messages) {
    if (message.role === 'assistant') {
      for (const call of message.toolCalls) {
        toolNames.set(call.id, call.name);
      }
    }
  }

  return [
    { role: 'system' as const, content: request.system },
    ...request.messages.flatMap((message) => toOllamaTurn(message, toolNames)),
  ];
}

function toOllamaTurn(
  message: ModelMessage,
  toolNames: ReadonlyMap<string, string>,
): OllamaMessage[] {
  switch (message.role) {
    case 'user':
      return [{ role: 'user', content: message.text }];

    case 'assistant':
      return [
        {
          role: 'assistant',
          content: message.text,
          ...(message.toolCalls.length === 0
            ? {}
            : {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  function: { name: call.name, arguments: call.arguments },
                })),
              }),
        },
      ];

    case 'toolResults':
      return message.results.map((result) => {
        const name = toolNames.get(result.callId);
        return {
          role: 'tool' as const,
          content: result.content,
          ...(name === undefined ? {} : { tool_name: name }),
        };
      });
  }
}

function toModelResponse(
  final: OllamaChatChunk,
  rawCalls: readonly OllamaToolCall[],
  streamedText?: string,
): ModelResponse {
  const parsed = rawCalls.map((call, index): ToolCall => ({
    id: call.id ?? `call_${String(index)}`,
    name: call.function.name,
    arguments: call.function.arguments ?? {},
  }));

  const written = streamedText ?? final.message?.content ?? '';
  const turn =
    parsed.length > 0 ? { calls: parsed, text: written } : recover(written);

  return {
    text: turn.text,
    toolCalls: turn.calls,
    stopReason: toStopReason(final.done_reason, turn.calls.length > 0),
    usage: toUsage(final),
  };
}

/**
 * The syntax a chat template wraps a call in. Ollama normally consumes it and
 * hands back a parsed call; when it does not, the whole block arrives as
 * content instead — FIN-132.
 */
const WRITTEN_CALL = /<tool_call>([\s\S]*?)<\/tool_call>[ \t]*\n?/g;

/**
 * A call the model wrote as prose, read back into the field the port promises
 * it in. Only the syntax is recovered, never the intent: anything that is not
 * a whole well-formed block is left exactly where it was, because a model
 * writing *about* a call must not be mistaken for one making it.
 *
 * Recovering costs nothing when there is nothing to recover, and the
 * alternative is what a first run actually did — show the user a fragment of
 * a wire format and record none of what they said.
 */
function recover(written: string): { calls: ToolCall[]; text: string } {
  const calls: ToolCall[] = [];
  const rest = written.replace(WRITTEN_CALL, (block, body: string) => {
    const call = toWrittenCall(body, calls.length);
    if (call === undefined) return block;
    calls.push(call);
    return '';
  });

  return calls.length === 0
    ? { calls, text: written }
    : { calls, text: rest.trim() };
}

function toWrittenCall(body: string, index: number): ToolCall | undefined {
  const written = parseJson(body);
  if (written === undefined) return undefined;

  const name = written['name'];
  if (typeof name !== 'string' || name === '') return undefined;

  const args = written['arguments'];
  if (args !== undefined && !isJsonObject(args)) return undefined;

  return {
    id: `call_${String(index)}`,
    name,
    arguments: args ?? {},
  };
}

function parseJson(body: string): JsonObject | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toUsage(final: OllamaChatChunk): ModelUsage {
  return {
    inputTokens: final.prompt_eval_count ?? 0,
    outputTokens: final.eval_count ?? 0,
  };
}

/**
 * Ollama finishes a tool-calling turn with the same `stop` it gives plain
 * prose, so the calls themselves are what say the turn is unfinished. There
 * is no refusal reason: a model that declines says so in prose, which reaches
 * the caller as a finished turn.
 */
function toStopReason(
  reason: string | undefined,
  calledTools: boolean,
): ModelStopReason {
  if (calledTools) {
    return 'toolCalls';
  }
  return reason === 'length' ? 'maxTokens' : 'end';
}

function rethrowAsDomainError(cause: unknown): never {
  throw new LanguageModelFailed(
    cause instanceof Error ? cause.message : 'A chamada ao modelo falhou.',
  );
}
