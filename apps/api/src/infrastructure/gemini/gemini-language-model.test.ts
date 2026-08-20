import { describe, expect, it } from 'vitest';

import {
  LanguageModelFailed,
  type ModelRequest,
  type ModelStreamEvent,
} from '../../domain/ports/language-model.js';

import {
  GeminiLanguageModel,
  type GeminiReply,
  type GeminiRequest,
  type GeminiTransport,
} from './gemini-language-model.js';

const choice = {
  model: 'gemini-3.6-flash',
  maxTokens: 4_000,
  maxTokensStreaming: 8_000,
};

const ask = (overrides: Partial<ModelRequest> = {}): ModelRequest => ({
  system: 'You are setting up a budget.',
  messages: [{ role: 'user', text: 'Recebo 18 mil no dia 5' }],
  tools: [],
  ...overrides,
});

const said = (text: string): GeminiReply => ({
  candidates: [{ content: { role: 'model', parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 185, candidatesTokenCount: 77 },
});

/** Records what it was sent and returns what the test told it to. */
class StubTransport implements GeminiTransport {
  readonly sent: { model: string; request: GeminiRequest }[] = [];

  constructor(
    private readonly reply: GeminiReply | Error,
    private readonly chunks: GeminiReply[] = [],
  ) {}

  send(model: string, request: GeminiRequest): Promise<GeminiReply> {
    this.sent.push({ model, request });
    if (this.reply instanceof Error) return Promise.reject(this.reply);
    return Promise.resolve(this.reply);
  }

  stream(model: string, request: GeminiRequest): AsyncIterable<GeminiReply> {
    this.sent.push({ model, request });
    const { reply, chunks } = this;
    return {
      [Symbol.asyncIterator]: async function* iterate() {
        if (reply instanceof Error) throw reply;
        for (const chunk of chunks) yield await Promise.resolve(chunk);
      },
    };
  }
}

const modelFor = (stub: GeminiTransport) =>
  new GeminiLanguageModel(stub, choice);

async function collect(
  events: AsyncIterable<ModelStreamEvent>,
): Promise<ModelStreamEvent[]> {
  const seen: ModelStreamEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

const anchorTool = {
  name: 'record_payday_anchor',
  description: 'Record the day of the month the salary lands.',
  inputSchema: {
    type: 'object',
    properties: {
      dayOfMonth: { type: 'integer', minimum: 1, maximum: 31 },
      shiftPolicy: { type: 'string', enum: ['PRECEDING', 'FOLLOWING'] },
    },
    required: ['dayOfMonth'],
    additionalProperties: false,
  },
};

describe('GeminiLanguageModel', () => {
  it('answers as an available model', () => {
    expect(modelFor(new StubTransport(said('Oi.'))).isAvailable).toBe(true);
  });

  it('reads the reply text into the port response', async () => {
    const response = await modelFor(
      new StubTransport(said('Anotei.')),
    ).complete(ask());

    expect(response.text).toBe('Anotei.');
    expect(response.stopReason).toBe('end');
  });

  it('joins the text of every part the turn wrote', async () => {
    const stub = new StubTransport({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: 'Anotei. ' }, { text: 'Segue.' }],
          },
        },
      ],
    });

    expect((await modelFor(stub).complete(ask())).text).toBe('Anotei. Segue.');
  });

  it('sends the system prompt apart from the transcript, with the ceiling', async () => {
    const stub = new StubTransport(said('ok'));

    await modelFor(stub).complete(ask());

    expect(stub.sent[0]?.model).toBe('gemini-3.6-flash');
    expect(stub.sent[0]?.request).toMatchObject({
      systemInstruction: { parts: [{ text: 'You are setting up a budget.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Recebo 18 mil no dia 5' }] }],
      generationConfig: { maxOutputTokens: 4_000 },
    });
  });

  /**
   * Gemini's schema is an OpenAPI subset and rejects a name it does not know
   * outright, so `additionalProperties` — which strict tool use elsewhere
   * wants — has to be dropped rather than passed on.
   */
  it('declares tools in Gemini’s schema subset', async () => {
    const stub = new StubTransport(said('ok'));

    await modelFor(stub).complete(ask({ tools: [anchorTool] }));

    expect(stub.sent[0]?.request.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'record_payday_anchor',
            description: 'Record the day of the month the salary lands.',
            parameters: {
              type: 'object',
              properties: {
                dayOfMonth: { type: 'integer', minimum: 1, maximum: 31 },
                shiftPolicy: {
                  type: 'string',
                  enum: ['PRECEDING', 'FOLLOWING'],
                },
              },
              required: ['dayOfMonth'],
            },
          },
        ],
      },
    ]);
  });

  it('declares no tools at all when the turn is plain prose', async () => {
    const stub = new StubTransport(said('ok'));

    await modelFor(stub).complete(ask());

    expect(stub.sent[0]?.request.tools).toBeUndefined();
  });

  it('maps a function call onto the port, with its arguments', async () => {
    const stub = new StubTransport({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: 'call_863761',
                  name: 'record_payday_anchor',
                  args: { dayOfMonth: 31, shiftPolicy: 'PRECEDING' },
                },
                thoughtSignature: 'EucECuQEARFNMg',
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    });

    const response = await modelFor(stub).complete(ask());

    expect(response.toolCalls).toEqual([
      {
        id: 'call_863761',
        name: 'record_payday_anchor',
        arguments: { dayOfMonth: 31, shiftPolicy: 'PRECEDING' },
        continuation: 'EucECuQEARFNMg',
      },
    ]);
    expect(response.stopReason).toBe('toolCalls');
  });

  it('names a call the server left unidentified', async () => {
    const stub = new StubTransport({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'finish_section' } }],
          },
        },
      ],
    });

    const response = await modelFor(stub).complete(ask());

    expect(response.toolCalls[0]).toEqual({
      id: 'call_0',
      name: 'finish_section',
      arguments: {},
    });
  });

  /**
   * The signature is what makes a replayed call acceptable — Gemini rejects a
   * transcript whose calls arrive without one, and both flows resend the
   * whole transcript every turn.
   */
  it('hands a call back with the signature it came with', async () => {
    const stub = new StubTransport(said('ok'));

    await modelFor(stub).complete(
      ask({
        messages: [
          { role: 'user', text: 'dia 31' },
          {
            role: 'assistant',
            text: '',
            toolCalls: [
              {
                id: 'call_1',
                name: 'record_payday_anchor',
                arguments: { dayOfMonth: 31 },
                continuation: 'EucECuQE',
              },
            ],
          },
          {
            role: 'toolResults',
            results: [
              { callId: 'call_1', content: 'Registrado.', isError: false },
            ],
          },
        ],
      }),
    );

    expect(stub.sent[0]?.request.contents).toEqual([
      { role: 'user', parts: [{ text: 'dia 31' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'record_payday_anchor',
              args: { dayOfMonth: 31 },
            },
            thoughtSignature: 'EucECuQE',
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'record_payday_anchor',
              response: { result: 'Registrado.' },
            },
          },
        ],
      },
    ]);
  });

  it('omits the signature from a call that never carried one', async () => {
    const stub = new StubTransport(said('ok'));

    await modelFor(stub).complete(
      ask({
        messages: [
          {
            role: 'assistant',
            text: 'Anotei.',
            toolCalls: [
              { id: 'call_1', name: 'finish_section', arguments: {} },
            ],
          },
        ],
      }),
    );

    expect(stub.sent[0]?.request.contents[0]).toEqual({
      role: 'model',
      parts: [
        { text: 'Anotei.' },
        { functionCall: { name: 'finish_section', args: {} } },
      ],
    });
  });

  it('tells the model which results failed', async () => {
    const stub = new StubTransport(said('ok'));

    await modelFor(stub).complete(
      ask({
        messages: [
          {
            role: 'assistant',
            text: '',
            toolCalls: [
              { id: 'call_1', name: 'record_fixed_bill', arguments: {} },
            ],
          },
          {
            role: 'toolResults',
            results: [
              { callId: 'call_1', content: 'Falta o dia.', isError: true },
            ],
          },
        ],
      }),
    );

    expect(stub.sent[0]?.request.contents[1]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'record_fixed_bill',
            response: { error: 'Falta o dia.' },
          },
        },
      ],
    });
  });

  /**
   * Reasoning is billed as output and counted apart, so a day's spend that
   * reads only `candidatesTokenCount` is a day's spend under-reported.
   */
  it('counts reasoning tokens as output, beside the answer’s own', async () => {
    const stub = new StubTransport({
      candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }],
      usageMetadata: {
        promptTokenCount: 214,
        candidatesTokenCount: 28,
        thoughtsTokenCount: 163,
      },
    });

    expect((await modelFor(stub).complete(ask())).usage).toEqual({
      inputTokens: 214,
      outputTokens: 191,
    });
  });

  it('counts zero when the server reported no usage at all', async () => {
    const stub = new StubTransport({ candidates: [] });

    expect((await modelFor(stub).complete(ask())).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it.each([
    ['MAX_TOKENS', 'maxTokens'],
    ['SAFETY', 'refusal'],
    ['PROHIBITED_CONTENT', 'refusal'],
    ['STOP', 'end'],
  ])('reads %s as %s', async (finishReason, expected) => {
    const stub = new StubTransport({
      candidates: [
        { content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason },
      ],
    });

    expect((await modelFor(stub).complete(ask())).stopReason).toBe(expected);
  });

  it('surfaces an unreachable server as a domain failure', async () => {
    const stub = new StubTransport(new Error('fetch failed'));

    await expect(modelFor(stub).complete(ask())).rejects.toBeInstanceOf(
      LanguageModelFailed,
    );
  });
});

describe('GeminiLanguageModel streaming', () => {
  it('emits the text as it arrives, then the calls, then the response', async () => {
    const stub = new StubTransport(said(''), [
      {
        candidates: [{ content: { role: 'model', parts: [{ text: 'Dia ' }] } }],
      },
      {
        candidates: [{ content: { role: 'model', parts: [{ text: '31.' }] } }],
      },
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: { name: 'finish_section', args: {} },
                  thoughtSignature: 'EqAC',
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
      },
    ]);

    const events = await collect(modelFor(stub).stream(ask()));

    expect(events).toEqual([
      { kind: 'text', delta: 'Dia ' },
      { kind: 'text', delta: '31.' },
      {
        kind: 'toolCall',
        call: {
          id: 'call_0',
          name: 'finish_section',
          arguments: {},
          continuation: 'EqAC',
        },
      },
      {
        kind: 'done',
        response: {
          text: 'Dia 31.',
          toolCalls: [
            {
              id: 'call_0',
              name: 'finish_section',
              arguments: {},
              continuation: 'EqAC',
            },
          ],
          stopReason: 'toolCalls',
          usage: { inputTokens: 10, outputTokens: 4 },
        },
      },
    ]);
  });

  it('asks the server to stream, with the streaming ceiling', async () => {
    const stub = new StubTransport(said(''), []);

    await collect(modelFor(stub).stream(ask()));

    expect(stub.sent[0]?.request.generationConfig).toEqual({
      maxOutputTokens: 8_000,
    });
  });

  it('surfaces a stream that fails mid-flight as a domain failure', async () => {
    const stub = new StubTransport(new Error('socket hang up'), []);

    await expect(collect(modelFor(stub).stream(ask()))).rejects.toBeInstanceOf(
      LanguageModelFailed,
    );
  });
});
