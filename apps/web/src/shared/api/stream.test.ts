import type { AssistantStreamEvent } from '@fin/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './client.js';
import { streamEvents } from './stream.js';

function respondWith(chunks: string[], status = 200): void {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status }))),
  );
}

async function collect(): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = [];
  for await (const event of streamEvents<AssistantStreamEvent>('/assistant')) {
    events.push(event);
  }

  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamEvents', () => {
  /**
   * A frame is only an event once its blank line has arrived. Reading each
   * chunk as a whole frame is how a token gets rendered as `{"delta":"Bec`.
   */
  it('yields a frame split across two chunks as one event', async () => {
    respondWith([
      'event: text\ndata: {"del',
      'ta":"Because "}\n\nevent: text\ndata: {"delta":"September"}\n\n',
    ]);

    expect(await collect()).toEqual([
      { event: 'text', data: { delta: 'Because ' } },
      { event: 'text', data: { delta: 'September' } },
    ]);
  });

  it('ignores a frame with no data line', async () => {
    respondWith([': keep-alive\n\nevent: text\ndata: {"delta":"hi"}\n\n']);

    expect(await collect()).toEqual([{ event: 'text', data: { delta: 'hi' } }]);
  });

  /**
   * Anything failing before the first token is a status code, so the reason
   * has to survive as an ApiError rather than as an empty stream.
   */
  it('throws with the reason when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'No model is configured.' }), {
            status: 503,
          }),
        ),
      ),
    );

    await expect(collect()).rejects.toThrow(ApiError);
    await expect(collect()).rejects.toThrow('No model is configured.');
  });

  it('ends quietly when the response has no body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
    );

    expect(await collect()).toEqual([]);
  });
});
