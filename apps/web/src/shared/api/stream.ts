import { apiUrl } from '../config/env.js';

import { ApiError, explanationOf } from './client.js';

/** The blank line that ends one server-sent event. */
const FRAME_END = '\n\n';

/**
 * The streaming door to the API, for the one route that answers as it thinks
 * rather than when it has finished — UC-8. Everything else goes through
 * `api<T>()`, which has a whole body to parse.
 *
 * The caller names the frame union it expects; the server owns the shape, and
 * an unknown event name simply never matches a branch of that union.
 */
export async function* streamEvents<T>(
  path: string,
  init?: RequestInit,
): AsyncGenerator<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'text/event-stream');
  if (typeof init?.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });

  // Anything that fails before the first token is a status code, so the
  // reason is still readable here rather than buried in a 200.
  if (!response.ok) {
    throw new ApiError(response.status, path, await explanationOf(response));
  }
  if (response.body === null) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // A chunk boundary falls wherever the network put it, so a frame is
      // only an event once its blank line has arrived. Reading a chunk as a
      // frame is how half a token reaches the screen.
      let end = buffer.indexOf(FRAME_END);
      while (end !== -1) {
        const frame = parse(buffer.slice(0, end));
        buffer = buffer.slice(end + FRAME_END.length);
        if (frame !== undefined) {
          yield frame as T;
        }
        end = buffer.indexOf(FRAME_END);
      }
    }
  } finally {
    // Reached when the caller stops reading early too — cancelling closes the
    // response, and with it the model call still writing into it.
    await reader.cancel();
  }
}

function parse(frame: string): { event: string; data: unknown } | undefined {
  let event = 'message';
  const data: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice('data:'.length).trim());
    }
  }

  return data.length === 0
    ? undefined
    : { event, data: JSON.parse(data.join('\n')) as unknown };
}
