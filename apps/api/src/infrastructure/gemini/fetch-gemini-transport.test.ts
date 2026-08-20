import { describe, expect, it } from 'vitest';

import type { GeminiRequest } from './gemini-language-model.js';
import {
  DEFAULT_GEMINI_URL,
  FetchGeminiTransport,
  type FetchLike,
  type HttpReply,
} from './fetch-gemini-transport.js';

const request: GeminiRequest = {
  systemInstruction: { parts: [{ text: 'Set up a budget.' }] },
  contents: [{ role: 'user', parts: [{ text: 'dia 5' }] }],
  generationConfig: { maxOutputTokens: 4_000 },
};

function ok(body: string, chunks?: string[]): HttpReply {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(body),
    body:
      chunks === undefined
        ? null
        : {
            [Symbol.asyncIterator]: async function* iterate() {
              const encoder = new TextEncoder();
              for (const chunk of chunks) {
                yield await Promise.resolve(encoder.encode(chunk));
              }
            },
          },
  };
}

const recording = (reply: HttpReply) => {
  const calls: { url: string; body: string }[] = [];
  const http: FetchLike = (url, init) => {
    calls.push({ url, body: init.body });
    return Promise.resolve(reply);
  };
  return { calls, http };
};

describe('FetchGeminiTransport', () => {
  it('posts to the model’s generateContent endpoint', async () => {
    const { calls, http } = recording(ok('{"candidates":[]}'));

    await new FetchGeminiTransport(DEFAULT_GEMINI_URL, 'a-key', http).send(
      'gemini-3.6-flash',
      request,
    );

    expect(calls[0]?.url).toBe(
      `${DEFAULT_GEMINI_URL}/models/gemini-3.6-flash:generateContent`,
    );
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual(request);
  });

  /**
   * In a header rather than the query string: a URL is what ends up in a log
   * line or an error message, and a key does not belong in either.
   */
  it('sends the key as a header, never in the URL', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const http: FetchLike = (url, init) => {
      calls.push({ url, headers: init.headers });
      return Promise.resolve(ok('{}'));
    };

    await new FetchGeminiTransport(DEFAULT_GEMINI_URL, 'a-key', http).send(
      'gemini-3.6-flash',
      request,
    );

    expect(calls[0]?.headers['x-goog-api-key']).toBe('a-key');
    expect(calls[0]?.url).not.toContain('a-key');
  });

  it('reads the reply as one whole response', async () => {
    const { http } = recording(ok('{"usageMetadata":{"promptTokenCount":7}}'));

    const reply = await new FetchGeminiTransport(
      DEFAULT_GEMINI_URL,
      'a-key',
      http,
    ).send('gemini-3.6-flash', request);

    expect(reply.usageMetadata?.promptTokenCount).toBe(7);
  });

  it('asks for server-sent events when streaming', async () => {
    const { calls, http } = recording(ok('', []));

    const stream = new FetchGeminiTransport(
      DEFAULT_GEMINI_URL,
      'a-key',
      http,
    ).stream('gemini-3.6-flash', request);
    for await (const _ of stream) void _;

    expect(calls[0]?.url).toBe(
      `${DEFAULT_GEMINI_URL}/models/gemini-3.6-flash:streamGenerateContent?alt=sse`,
    );
  });

  it('reads each data line of the stream as a reply', async () => {
    const { http } = recording(
      ok('', [
        'data: {"candidates":[{"content":{"parts":[{"text":"Dia "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"31."}]}}]}\n\n',
      ]),
    );

    const seen = [];
    for await (const reply of new FetchGeminiTransport(
      DEFAULT_GEMINI_URL,
      'a-key',
      http,
    ).stream('gemini-3.6-flash', request)) {
      seen.push(reply.candidates?.[0]?.content?.parts?.[0]?.text);
    }

    expect(seen).toEqual(['Dia ', '31.']);
  });

  /** A chunk boundary is not a line boundary, and one line arrives split. */
  it('joins a data line split across two chunks', async () => {
    const { http } = recording(
      ok('', [
        'data: {"candidates":[{"content":{"parts":[{"te',
        'xt":"inteiro"}]}}]}\n\n',
      ]),
    );

    const seen = [];
    for await (const reply of new FetchGeminiTransport(
      DEFAULT_GEMINI_URL,
      'a-key',
      http,
    ).stream('gemini-3.6-flash', request)) {
      seen.push(reply.candidates?.[0]?.content?.parts?.[0]?.text);
    }

    expect(seen).toEqual(['inteiro']);
  });

  it('surfaces a rejected request with what the server said', async () => {
    const http: FetchLike = () =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"error":{"message":"bad schema"}}'),
        body: null,
      });

    await expect(
      new FetchGeminiTransport(DEFAULT_GEMINI_URL, 'a-key', http).send(
        'gemini-3.6-flash',
        request,
      ),
    ).rejects.toThrow('bad schema');
  });

  it('fails a stream the server answered with no body', async () => {
    const { http } = recording(ok(''));

    const stream = new FetchGeminiTransport(
      DEFAULT_GEMINI_URL,
      'a-key',
      http,
    ).stream('gemini-3.6-flash', request);

    await expect(
      (async () => {
        for await (const _ of stream) void _;
      })(),
    ).rejects.toThrow('no body');
  });
});
