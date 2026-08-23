import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import {
  LanguageModelFailed,
  type ModelRequest,
  type ModelStreamEvent,
} from '../../domain/ports/language-model.js';

import {
  ClaudeLanguageModel,
  type MessagesApi,
  type MessageStreamLike,
} from './claude-language-model.js';
import { MODELS } from './models.js';

const modelFor = (stub: MessagesApi) =>
  new ClaudeLanguageModel(stub, MODELS.assistant);

const ask = (overrides: Partial<ModelRequest> = {}): ModelRequest => ({
  system: 'You are setting up a budget.',
  messages: [{ role: 'user', text: 'I earn 18k' }],
  tools: [],
  ...overrides,
});

function reply(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODELS.assistant.id,
    content: [{ type: 'text', text: 'Understood.', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    ...overrides,
  } as Anthropic.Message;
}

/** Records what it was sent and returns what the test told it to. */
class StubMessages implements MessagesApi {
  readonly sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  readonly streamed: Anthropic.MessageStreamParams[] = [];

  constructor(
    private readonly response: Anthropic.Message | Error,
    private readonly events: Anthropic.MessageStreamEvent[] = [],
  ) {}

  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    this.sent.push(params);
    if (this.response instanceof Error) return Promise.reject(this.response);
    return Promise.resolve(this.response);
  }

  stream(params: Anthropic.MessageStreamParams): MessageStreamLike {
    this.streamed.push(params);
    const { response, events } = this;
    return {
      [Symbol.asyncIterator]: async function* iterate() {
        for (const event of events) yield await Promise.resolve(event);
      },
      finalMessage: () =>
        response instanceof Error
          ? Promise.reject(response)
          : Promise.resolve(response),
    };
  }
}

const textDelta = (text: string): Anthropic.MessageStreamEvent => ({
  type: 'content_block_delta',
  index: 0,
  delta: { type: 'text_delta', text },
});

async function collect(
  events: AsyncIterable<ModelStreamEvent>,
): Promise<ModelStreamEvent[]> {
  const seen: ModelStreamEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('ClaudeLanguageModel', () => {
  it('joins the text blocks of a reply into the port response', async () => {
    const stub = new StubMessages(
      reply({
        content: [
          { type: 'text', text: 'You will have ', citations: null },
          { type: 'text', text: 'R$ 3.556 free.', citations: null },
        ],
      }),
    );

    const response = await modelFor(stub).complete(ask());

    expect(response.text).toBe('You will have R$ 3.556 free.');
    expect(response.stopReason).toBe('end');
  });

  /**
   * Every extracted record and every read the assistant performs arrives as a
   * tool call, so this mapping is the one the rest of the app is built on.
   */
  it('maps tool_use blocks onto tool calls with their arguments', async () => {
    const stub = new StubMessages(
      reply({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'record_salary',
            input: { amountInCents: 1_800_000 },
          } as unknown as Anthropic.ContentBlock,
        ],
      }),
    );

    const response = await modelFor(stub).complete(ask());

    expect(response.stopReason).toBe('toolCalls');
    expect(response.toolCalls).toEqual([
      {
        id: 'toolu_1',
        name: 'record_salary',
        arguments: { amountInCents: 1_800_000 },
      },
    ]);
  });

  /**
   * A refusal is a well-formed response, not a thrown error — the caller has
   * to be able to read the reason before it reads the text.
   */
  it.each([
    ['end_turn', 'end'],
    ['stop_sequence', 'end'],
    ['tool_use', 'toolCalls'],
    ['max_tokens', 'maxTokens'],
    ['model_context_window_exceeded', 'maxTokens'],
    ['refusal', 'refusal'],
  ])('maps the %s stop reason onto %s', async (sdkReason, expected) => {
    const stub = new StubMessages(
      reply({ stop_reason: sdkReason as Anthropic.StopReason }),
    );

    const response = await modelFor(stub).complete(ask());

    expect(response.stopReason).toBe(expected);
  });

  /**
   * `strict` is what makes a hallucinated shape a validation failure at the
   * provider rather than a bad record this app has to defend against later.
   */
  it('declares tools with strict schema validation', async () => {
    const stub = new StubMessages(reply());

    await modelFor(stub).complete(
      ask({
        tools: [
          {
            name: 'record_salary',
            description: 'Record what the user earns.',
            inputSchema: {
              type: 'object',
              properties: { amountInCents: { type: 'integer' } },
              required: ['amountInCents'],
              additionalProperties: false,
            },
          },
        ],
      }),
    );

    expect(stub.sent[0]?.tools).toEqual([
      {
        name: 'record_salary',
        description: 'Record what the user earns.',
        strict: true,
        input_schema: {
          type: 'object',
          properties: { amountInCents: { type: 'integer' } },
          required: ['amountInCents'],
          additionalProperties: false,
        },
      },
    ]);
  });

  /**
   * Replaying a conversation that used tools means sending the calls back
   * alongside their results; a model asked to read a result for a call it has
   * no record of making is being handed an inconsistent transcript.
   */
  it('replays assistant tool calls and their results in the SDK shape', async () => {
    const stub = new StubMessages(reply());

    await modelFor(stub).complete(
      ask({
        messages: [
          { role: 'user', text: 'how much is left?' },
          {
            role: 'assistant',
            text: 'Let me look.',
            toolCalls: [{ id: 'toolu_1', name: 'read_cycle', arguments: {} }],
          },
          {
            role: 'toolResults',
            results: [
              {
                callId: 'toolu_1',
                content: '{"netSurplus":355600}',
                isError: false,
              },
            ],
          },
        ],
      }),
    );

    expect(stub.sent[0]?.messages).toEqual([
      { role: 'user', content: 'how much is left?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me look.' },
          { type: 'tool_use', id: 'toolu_1', name: 'read_cycle', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '{"netSurplus":355600}',
            is_error: false,
          },
        ],
      },
    ]);
  });

  it('sends the system prompt and the model it was given', async () => {
    const stub = new StubMessages(reply());

    await modelFor(stub).complete(ask());

    expect(stub.sent[0]?.system).toBe('You are setting up a budget.');
    expect(stub.sent[0]?.model).toBe(MODELS.assistant.id);
  });

  /**
   * Extraction and the assistant are different jobs on different models, so
   * the adapter must carry whichever it was handed rather than a constant.
   */
  it('uses the extraction model and its ceiling when given that choice', async () => {
    const stub = new StubMessages(reply());

    await new ClaudeLanguageModel(stub, MODELS.extraction).complete(ask());

    expect(stub.sent[0]?.model).toBe(MODELS.extraction.id);
    expect(stub.sent[0]?.max_tokens).toBe(MODELS.extraction.maxTokens);
  });

  it('streams text deltas, then tool calls, then the final response', async () => {
    const stub = new StubMessages(
      reply({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Looking.', citations: null },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'read_cycle',
            input: {},
          } as unknown as Anthropic.ContentBlock,
        ],
      }),
      [textDelta('Look'), textDelta('ing.')],
    );

    const events = await collect(modelFor(stub).stream(ask()));

    expect(events).toEqual([
      { kind: 'text', delta: 'Look' },
      { kind: 'text', delta: 'ing.' },
      {
        kind: 'toolCall',
        call: { id: 'toolu_1', name: 'read_cycle', arguments: {} },
      },
      {
        kind: 'done',
        response: {
          text: 'Looking.',
          toolCalls: [{ id: 'toolu_1', name: 'read_cycle', arguments: {} }],
          stopReason: 'toolCalls',
        },
      },
    ]);
  });

  /**
   * The domain never learns about HTTP, so a transport failure has to cross
   * this boundary as a domain error for the interface layer to map.
   */
  it('surfaces a failure from the SDK as a domain error', async () => {
    const stub = new StubMessages(new Error('503 upstream unavailable'));

    await expect(modelFor(stub).complete(ask())).rejects.toBeInstanceOf(
      LanguageModelFailed,
    );
  });

  it('surfaces a streaming failure as a domain error too', async () => {
    const stub = new StubMessages(new Error('connection reset'));

    await expect(collect(modelFor(stub).stream(ask()))).rejects.toBeInstanceOf(
      LanguageModelFailed,
    );
  });
});
