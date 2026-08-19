import { describe, expect, it } from 'vitest';

import {
  LanguageModelFailed,
  type ModelRequest,
  type ModelStreamEvent,
} from '../../domain/ports/language-model.js';

import {
  OllamaLanguageModel,
  type OllamaChatChunk,
  type OllamaChatRequest,
  type OllamaTransport,
} from './ollama-language-model.js';

const choice = {
  model: 'qwen2.5:7b',
  maxTokens: 4_000,
  maxTokensStreaming: 8_000,
};

const ask = (overrides: Partial<ModelRequest> = {}): ModelRequest => ({
  system: 'You are setting up a budget.',
  messages: [{ role: 'user', text: 'I earn 18k' }],
  tools: [],
  ...overrides,
});

function reply(overrides: Partial<OllamaChatChunk> = {}): OllamaChatChunk {
  return {
    message: { role: 'assistant', content: 'Understood.' },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 185,
    eval_count: 77,
    ...overrides,
  };
}

/** Records what it was sent and returns what the test told it to. */
class StubTransport implements OllamaTransport {
  readonly sent: OllamaChatRequest[] = [];

  constructor(
    private readonly response: OllamaChatChunk | Error,
    private readonly chunks: OllamaChatChunk[] = [],
  ) {}

  send(request: OllamaChatRequest): Promise<OllamaChatChunk> {
    this.sent.push(request);
    if (this.response instanceof Error) return Promise.reject(this.response);
    return Promise.resolve(this.response);
  }

  stream(request: OllamaChatRequest): AsyncIterable<OllamaChatChunk> {
    this.sent.push(request);
    const { response, chunks } = this;
    return {
      [Symbol.asyncIterator]: async function* iterate() {
        if (response instanceof Error) throw response;
        for (const chunk of chunks) yield await Promise.resolve(chunk);
      },
    };
  }
}

const modelFor = (stub: OllamaTransport) =>
  new OllamaLanguageModel(stub, choice);

async function collect(
  events: AsyncIterable<ModelStreamEvent>,
): Promise<ModelStreamEvent[]> {
  const seen: ModelStreamEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('OllamaLanguageModel', () => {
  it('answers as an available model', () => {
    expect(modelFor(new StubTransport(reply())).isAvailable).toBe(true);
  });

  it('reads the reply text into the port response', async () => {
    const stub = new StubTransport(
      reply({ message: { role: 'assistant', content: 'R$ 3.556 free.' } }),
    );

    const response = await modelFor(stub).complete(ask());

    expect(response.text).toBe('R$ 3.556 free.');
    expect(response.stopReason).toBe('end');
  });

  it('sends the system prompt, the transcript and the token ceiling', async () => {
    const stub = new StubTransport(reply());

    await modelFor(stub).complete(ask());

    expect(stub.sent[0]).toMatchObject({
      model: 'qwen2.5:7b',
      stream: false,
      options: { num_predict: 4_000 },
      messages: [
        { role: 'system', content: 'You are setting up a budget.' },
        { role: 'user', content: 'I earn 18k' },
      ],
    });
  });

  it('declares tools in Ollama’s own shape', async () => {
    const stub = new StubTransport(reply());
    const schema = {
      type: 'object',
      properties: { amountInCents: { type: 'integer' } },
    };

    await modelFor(stub).complete(
      ask({
        tools: [
          {
            name: 'record_bill',
            description: 'Record one recurring bill.',
            inputSchema: schema,
          },
        ],
      }),
    );

    expect(stub.sent[0]?.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'record_bill',
          description: 'Record one recurring bill.',
          parameters: schema,
        },
      },
    ]);
  });

  /**
   * Every extracted record and every read the assistant performs arrives as a
   * tool call, so this mapping is the one the rest of the app is built on.
   */
  it('maps tool calls onto the port, with their arguments', async () => {
    const stub = new StubTransport(
      reply({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_8cajfpsk',
              function: {
                name: 'record_bill',
                arguments: {
                  description: 'Health Plan',
                  amountInCents: 32_000,
                },
              },
            },
          ],
        },
      }),
    );

    const response = await modelFor(stub).complete(ask());

    expect(response.toolCalls).toEqual([
      {
        id: 'call_8cajfpsk',
        name: 'record_bill',
        arguments: { description: 'Health Plan', amountInCents: 32_000 },
      },
    ]);
  });

  /**
   * Ollama finishes a tool-calling turn with `done_reason: "stop"`, the same
   * reason it gives for plain prose. The calls themselves are what say the
   * turn is unfinished, so the stop reason is derived from them.
   */
  it('reports a turn that called tools as toolCalls, not as end', async () => {
    const stub = new StubTransport(
      reply({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'read_cycle', arguments: {} } }],
        },
      }),
    );

    expect((await modelFor(stub).complete(ask())).stopReason).toBe('toolCalls');
  });

  /**
   * A server old enough not to carry ids still has to produce calls the next
   * turn can answer, so the adapter names them itself when it must.
   */
  it('names a call the server left unidentified', async () => {
    const stub = new StubTransport(
      reply({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'read_cycle', arguments: {} } },
            { function: { name: 'read_buckets', arguments: {} } },
          ],
        },
      }),
    );

    const { toolCalls } = await modelFor(stub).complete(ask());

    expect(toolCalls.map((call) => call.id)).toEqual(['call_0', 'call_1']);
  });

  /**
   * A field the user did not answer comes back as an explicit `null` from
   * this model rather than as an absent key. It is passed through as it
   * arrived: the application reads both as unanswered, and an adapter that
   * stripped nulls would hide a shape the real API may well send.
   */
  it('passes an explicit null argument through untouched', async () => {
    const stub = new StubTransport(
      reply({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'record_bill',
                arguments: { description: 'Health Plan', dueDayOfMonth: null },
              },
            },
          ],
        },
      }),
    );

    const { toolCalls } = await modelFor(stub).complete(ask());

    expect(toolCalls[0]?.arguments).toEqual({
      description: 'Health Plan',
      dueDayOfMonth: null,
    });
  });

  it('treats a call with no arguments as an empty object', async () => {
    const stub = new StubTransport(
      reply({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'read_cycle' } }],
        },
      }),
    );

    expect(
      (await modelFor(stub).complete(ask())).toolCalls[0]?.arguments,
    ).toEqual({});
  });

  it('counts what the call cost from Ollama’s two counters', async () => {
    const stub = new StubTransport(reply());

    expect((await modelFor(stub).complete(ask())).usage).toEqual({
      inputTokens: 185,
      outputTokens: 77,
    });
  });

  it('counts zero when the server reported no counters at all', async () => {
    const stub = new StubTransport({ message: { content: 'Hi' }, done: true });

    expect((await modelFor(stub).complete(ask())).usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it.each([
    ['length', 'maxTokens'],
    ['stop', 'end'],
    ['unload', 'end'],
    [undefined, 'end'],
  ])('collapses done_reason %s onto %s', async (reason, expected) => {
    const stub = new StubTransport(
      reason === undefined
        ? { message: { content: '' }, done: true }
        : reply({ done_reason: reason }),
    );

    expect((await modelFor(stub).complete(ask())).stopReason).toBe(expected);
  });

  /**
   * Ollama has no refusal reason of its own — a model that declines simply
   * says so in prose, which reaches the caller as a finished turn.
   */
  it('reads an assistant turn back with its calls, and results as tool turns', async () => {
    const stub = new StubTransport(reply());

    await modelFor(stub).complete(
      ask({
        messages: [
          { role: 'user', text: 'What is due?' },
          {
            role: 'assistant',
            text: 'Let me look.',
            toolCalls: [
              {
                id: 'call_1',
                name: 'read_cycle',
                arguments: { month: '2026-10' },
              },
            ],
          },
          {
            role: 'toolResults',
            results: [
              { callId: 'call_1', content: 'R$ 9.110', isError: false },
            ],
          },
        ],
      }),
    );

    expect(stub.sent[0]?.messages).toEqual([
      { role: 'system', content: 'You are setting up a budget.' },
      { role: 'user', content: 'What is due?' },
      {
        role: 'assistant',
        content: 'Let me look.',
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'read_cycle', arguments: { month: '2026-10' } },
          },
        ],
      },
      { role: 'tool', content: 'R$ 9.110', tool_name: 'read_cycle' },
    ]);
  });

  it('sends a tool result whose call it never saw without a name', async () => {
    const stub = new StubTransport(reply());

    await modelFor(stub).complete(
      ask({
        messages: [
          {
            role: 'toolResults',
            results: [{ callId: 'unknown', content: 'gone', isError: true }],
          },
        ],
      }),
    );

    expect(stub.sent[0]?.messages[1]).toEqual({
      role: 'tool',
      content: 'gone',
    });
  });

  it('surfaces an unreachable server as a domain failure', async () => {
    const stub = new StubTransport(new Error('connect ECONNREFUSED'));

    await expect(modelFor(stub).complete(ask())).rejects.toThrow(
      LanguageModelFailed,
    );
  });
});

describe('OllamaLanguageModel streaming', () => {
  it('emits the text as it arrives, then the calls, then the response', async () => {
    const stub = new StubTransport(reply(), [
      { message: { content: 'You will ' } },
      { message: { content: 'have R$ 3.556.' } },
      {
        message: {
          content: '',
          tool_calls: [{ function: { name: 'read_cycle', arguments: {} } }],
        },
      },
      {
        message: { content: '' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 12,
        eval_count: 4,
      },
    ]);

    const events = await collect(modelFor(stub).stream(ask()));

    expect(events).toEqual([
      { kind: 'text', delta: 'You will ' },
      { kind: 'text', delta: 'have R$ 3.556.' },
      {
        kind: 'toolCall',
        call: { id: 'call_0', name: 'read_cycle', arguments: {} },
      },
      {
        kind: 'done',
        response: {
          text: 'You will have R$ 3.556.',
          toolCalls: [{ id: 'call_0', name: 'read_cycle', arguments: {} }],
          stopReason: 'toolCalls',
          usage: { inputTokens: 12, outputTokens: 4 },
        },
      },
    ]);
  });

  it('asks the server to stream, with the streaming ceiling', async () => {
    const stub = new StubTransport(reply(), [
      { message: { content: 'Hi' }, done: true, done_reason: 'stop' },
    ]);

    await collect(modelFor(stub).stream(ask()));

    expect(stub.sent[0]).toMatchObject({
      stream: true,
      options: { num_predict: 8_000 },
    });
  });

  it('surfaces a stream that fails mid-flight as a domain failure', async () => {
    const stub = new StubTransport(new Error('socket hang up'));

    await expect(collect(modelFor(stub).stream(ask()))).rejects.toThrow(
      LanguageModelFailed,
    );
  });
});
