import { describe, expect, it } from 'vitest';

import type {
  ModelRequest,
  ModelStreamEvent,
} from '../../domain/ports/language-model.js';

import { FakeLanguageModel, ScriptExhausted } from './fake-language-model.js';

const ask = (text: string): ModelRequest => ({
  system: 'You are setting up a budget.',
  messages: [{ role: 'user', text }],
  tools: [],
});

async function collect(
  events: AsyncIterable<ModelStreamEvent>,
): Promise<ModelStreamEvent[]> {
  const seen: ModelStreamEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('FakeLanguageModel', () => {
  it('replays its scripted turns in order', async () => {
    const model = new FakeLanguageModel([
      { text: 'What do you earn?' },
      { text: 'And when does it land?' },
    ]);

    expect((await model.complete(ask('hello'))).text).toBe('What do you earn?');
    expect((await model.complete(ask('18k'))).text).toBe(
      'And when does it land?',
    );
  });

  /**
   * A tool call is how every extracted record arrives, so a test that cannot
   * script one cannot cover the path that matters.
   */
  it('replays tool calls with their arguments', async () => {
    const model = new FakeLanguageModel([
      {
        toolCalls: [
          {
            id: 'call-1',
            name: 'record_salary',
            arguments: { amountInCents: 1_800_000 },
          },
        ],
      },
    ]);

    const response = await model.complete(ask('18k on the 5th'));

    expect(response.stopReason).toBe('toolCalls');
    expect(response.toolCalls).toEqual([
      {
        id: 'call-1',
        name: 'record_salary',
        arguments: { amountInCents: 1_800_000 },
      },
    ]);
  });

  /**
   * What the interactor put in front of the model is the thing worth
   * asserting on — the system prompt it wrote and the tools it offered.
   */
  it('records every request it was asked', async () => {
    const model = new FakeLanguageModel([{ text: 'ok' }]);

    await model.complete(ask('hello'));

    expect(model.requests).toHaveLength(1);
    expect(model.requests[0]?.system).toBe('You are setting up a budget.');
  });

  /**
   * Returning an empty response past the end of the script would let a broken
   * interactor look green. Running out of script is a test bug and has to read
   * as one.
   */
  it('throws when driven past the end of its script', async () => {
    const model = new FakeLanguageModel([{ text: 'only one' }]);
    await model.complete(ask('first'));

    await expect(model.complete(ask('second'))).rejects.toBeInstanceOf(
      ScriptExhausted,
    );
  });

  it('streams the same turn as text deltas and a final response', async () => {
    const model = new FakeLanguageModel([{ text: 'Two words' }]);

    const events = await collect(model.stream(ask('hello')));

    expect(events).toEqual([
      { kind: 'text', delta: 'Two' },
      { kind: 'text', delta: ' words' },
      {
        kind: 'done',
        response: { text: 'Two words', toolCalls: [], stopReason: 'end' },
      },
    ]);
  });

  it('streams a tool call as its own event before finishing', async () => {
    const model = new FakeLanguageModel([
      { toolCalls: [{ id: 'c1', name: 'read_cycle', arguments: {} }] },
    ]);

    const events = await collect(model.stream(ask('how much is left?')));

    expect(events.map((event) => event.kind)).toEqual(['toolCall', 'done']);
  });

  it('throws when a stream is driven past the end of its script', async () => {
    const model = new FakeLanguageModel([]);

    await expect(collect(model.stream(ask('anything')))).rejects.toBeInstanceOf(
      ScriptExhausted,
    );
  });
});
