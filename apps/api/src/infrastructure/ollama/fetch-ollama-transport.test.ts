import { describe, expect, it } from 'vitest';

import type {
  OllamaChatChunk,
  OllamaChatRequest,
} from './ollama-language-model.js';
import {
  FetchOllamaTransport,
  type FetchLike,
  type HttpReply,
} from './fetch-ollama-transport.js';

const request: OllamaChatRequest = {
  model: 'qwen2.5:7b',
  messages: [{ role: 'user', content: 'I earn 18k' }],
  tools: [],
  stream: false,
  options: { num_predict: 4_000 },
};

const bytes = (text: string) => new TextEncoder().encode(text);

function replying(
  body: string,
  { ok = true, status = 200 } = {},
): { http: FetchLike; calls: { url: string; body: string }[] } {
  const calls: { url: string; body: string }[] = [];
  const http: FetchLike = (url, init) => {
    calls.push({ url, body: init.body });
    const reply: HttpReply = {
      ok,
      status,
      text: () => Promise.resolve(body),
      body: {
        [Symbol.asyncIterator]: async function* iterate() {
          yield await Promise.resolve(bytes(body));
        },
      },
    };
    return Promise.resolve(reply);
  };
  return { http, calls };
}

async function collect(
  chunks: AsyncIterable<OllamaChatChunk>,
): Promise<OllamaChatChunk[]> {
  const seen: OllamaChatChunk[] = [];
  for await (const chunk of chunks) seen.push(chunk);
  return seen;
}

describe('FetchOllamaTransport', () => {
  it('posts the request as JSON to the chat endpoint', async () => {
    const { http, calls } = replying('{"done":true}');

    await new FetchOllamaTransport('http://127.0.0.1:11434', http).send(
      request,
    );

    expect(calls[0]?.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(calls[0]?.body ?? '')).toMatchObject({
      model: 'qwen2.5:7b',
      stream: false,
    });
  });

  it('reads a whole reply back', async () => {
    const { http } = replying(
      '{"message":{"content":"Understood."},"done":true,"eval_count":7}',
    );

    const reply = await new FetchOllamaTransport('http://x', http).send(
      request,
    );

    expect(reply.message?.content).toBe('Understood.');
    expect(reply.eval_count).toBe(7);
  });

  /**
   * A server that is not running is the ordinary case here — the model is
   * started by hand — so it has to fail as a rejected call, which the adapter
   * turns into the same typed error the Anthropic path raises.
   */
  it('refuses a reply the server rejected, naming the status', async () => {
    const { http } = replying('{"error":"model not found"}', {
      ok: false,
      status: 404,
    });

    await expect(
      new FetchOllamaTransport('http://x', http).send(request),
    ).rejects.toThrow(/404.*model not found/);
  });
});

describe('FetchOllamaTransport streaming', () => {
  /** Newline-delimited JSON: one object per line, and lines split anywhere. */
  it('reads one object per line, however the bytes were split', async () => {
    const lines = [
      '{"message":{"content":"You will "}}',
      '{"message":{"content":"have R$ 3.556."}}',
      '{"done":true,"done_reason":"stop"}',
    ].join('\n');
    const pieces = [lines.slice(0, 20), lines.slice(20, 60), lines.slice(60)];

    const http: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(lines),
        body: {
          [Symbol.asyncIterator]: async function* iterate() {
            for (const piece of pieces)
              yield await Promise.resolve(bytes(piece));
          },
        },
      });

    const chunks = await collect(
      new FetchOllamaTransport('http://x', http).stream(request),
    );

    expect(chunks).toEqual([
      { message: { content: 'You will ' } },
      { message: { content: 'have R$ 3.556.' } },
      { done: true, done_reason: 'stop' },
    ]);
  });

  it('ignores the blank line a stream ends on', async () => {
    const { http } = replying('{"done":true}\n\n');

    const chunks = await collect(
      new FetchOllamaTransport('http://x', http).stream(request),
    );

    expect(chunks).toEqual([{ done: true }]);
  });

  it('refuses a stream the server rejected before it began', async () => {
    const { http } = replying('{"error":"model not found"}', {
      ok: false,
      status: 404,
    });

    await expect(
      collect(new FetchOllamaTransport('http://x', http).stream(request)),
    ).rejects.toThrow(/404/);
  });

  it('refuses a stream that arrived with no body at all', async () => {
    const http: FetchLike = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        body: null,
      });

    await expect(
      collect(new FetchOllamaTransport('http://x', http).stream(request)),
    ).rejects.toThrow(/no body/);
  });
});
