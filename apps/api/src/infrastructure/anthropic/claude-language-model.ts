import type Anthropic from '@anthropic-ai/sdk';

import type {
  JsonObject,
  LanguageModel,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelStopReason,
  ModelStreamEvent,
  ToolCall,
  ToolDeclaration,
} from '../../domain/ports/language-model.js';
import { LanguageModelFailed } from '../../domain/ports/language-model.js';

import type { ModelChoice } from './models.js';

/**
 * The slice of the SDK this adapter uses. Narrow on purpose: it is the seam a
 * test stands in for, and a test that had to satisfy the whole client would
 * prove less about the mapping than it cost to write.
 */
export interface MessagesApi {
  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message>;
  stream(params: Anthropic.MessageStreamParams): MessageStreamLike;
}

export interface MessageStreamLike extends AsyncIterable<Anthropic.MessageStreamEvent> {
  finalMessage(): Promise<Anthropic.Message>;
}

/**
 * The only file in the repository that knows Anthropic exists. Everything
 * above it takes the `LanguageModel` port, which is what lets the whole app
 * be tested without a key or a network.
 */
export class ClaudeLanguageModel implements LanguageModel {
  /**
   * The model is a constructor argument, not a constant: extraction and the
   * assistant are different jobs and the composition root names which is
   * which. One machine, one user — so it is still a decision in code, never
   * an env var nobody turns.
   */
  constructor(
    private readonly messages: MessagesApi,
    private readonly choice: ModelChoice,
  ) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const reply = await this.messages
      .create({
        model: this.choice.id,
        max_tokens: this.choice.maxTokens,
        system: request.system,
        messages: toSdkMessages(request.messages),
        tools: request.tools.map(toSdkTool),
      })
      .catch(rethrowAsDomainError);

    return toModelResponse(reply);
  }

  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const { messages, choice } = this;
    return (async function* emit(): AsyncGenerator<ModelStreamEvent> {
      const stream = messages.stream({
        model: choice.id,
        max_tokens: choice.maxTokensStreaming,
        system: request.system,
        messages: toSdkMessages(request.messages),
        tools: request.tools.map(toSdkTool),
      });

      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            yield { kind: 'text', delta: event.delta.text };
          }
        }

        const response = toModelResponse(await stream.finalMessage());
        for (const call of response.toolCalls) {
          yield { kind: 'toolCall', call };
        }
        yield { kind: 'done', response };
      } catch (cause) {
        rethrowAsDomainError(cause);
      }
    })();
  }
}

function toSdkTool(tool: ToolDeclaration): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    // Without this the model may return a shape the schema forbids, and a
    // malformed record would reach the app as data rather than as an error.
    strict: true,
    input_schema: tool.inputSchema as unknown as Anthropic.Tool.InputSchema,
  };
}

function toSdkMessages(
  messages: readonly ModelMessage[],
): Anthropic.MessageParam[] {
  return messages.map((message): Anthropic.MessageParam => {
    switch (message.role) {
      case 'user':
        return { role: 'user', content: message.text };

      case 'assistant':
        return {
          role: 'assistant',
          content: [
            { type: 'text', text: message.text },
            ...message.toolCalls.map((call) => ({
              type: 'tool_use' as const,
              id: call.id,
              name: call.name,
              input: call.arguments,
            })),
          ],
        };

      // A tool result is a user turn in the Messages API: the model asked,
      // and this is the caller answering.
      case 'toolResults':
        return {
          role: 'user',
          content: message.results.map((result) => ({
            type: 'tool_result' as const,
            tool_use_id: result.callId,
            content: result.content,
            is_error: result.isError,
          })),
        };
    }
  });
}

function toModelResponse(reply: Anthropic.Message): ModelResponse {
  const text = reply.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const toolCalls = reply.content
    .filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )
    .map((block): ToolCall => ({
      id: block.id,
      name: block.name,
      arguments: asJsonObject(block.input),
    }));

  return { text, toolCalls, stopReason: toStopReason(reply.stop_reason) };
}

function toStopReason(reason: Anthropic.StopReason | null): ModelStopReason {
  switch (reason) {
    case 'tool_use':
      return 'toolCalls';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'maxTokens';
    case 'refusal':
      return 'refusal';
    // `pause_turn` only arises with server-side tools, which this app declares
    // none of. Treated as a finished turn rather than given a port variant no
    // caller could ever act on.
    case 'pause_turn':
    case 'end_turn':
    case 'stop_sequence':
    case null:
      return 'end';
  }
}

/** The SDK types tool input as `unknown`; nothing else may assume its shape. */
function asJsonObject(input: unknown): JsonObject {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as JsonObject)
    : {};
}

function rethrowAsDomainError(cause: unknown): never {
  throw new LanguageModelFailed(
    cause instanceof Error ? cause.message : 'The model call failed.',
  );
}
