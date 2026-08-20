import type {
  GeminiReply,
  GeminiRequest,
  GeminiTransport,
} from './gemini-language-model.js';

/**
 * The slice of `fetch` this needs. Typed structurally rather than as the
 * global so a test can hand one in without a network, and so nothing here
 * depends on which runtime provides it.
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<HttpReply>;

export interface HttpReply {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  readonly body: AsyncIterable<Uint8Array> | null;
}

export const DEFAULT_GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini over plain HTTP. There is no SDK because there is nothing to wrap —
 * it is two REST endpoints, so `fetch` is the whole client and the model
 * stays behind the same boundary rule as everything else. It also leaves no
 * vendor package for `eslint-plugin-boundaries` to have to confine.
 */
export class FetchGeminiTransport implements GeminiTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly http: FetchLike,
  ) {}

  async send(model: string, request: GeminiRequest): Promise<GeminiReply> {
    const reply = await this.post(
      `${this.baseUrl}/models/${model}:generateContent`,
      request,
    );
    return JSON.parse(await reply.text()) as GeminiReply;
  }

  stream(model: string, request: GeminiRequest): AsyncIterable<GeminiReply> {
    const post = this.post.bind(this);
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse`;

    return (async function* emit(): AsyncGenerator<GeminiReply> {
      const reply = await post(url, request);
      if (reply.body === null) {
        throw new Error('Gemini answered the stream with no body.');
      }

      const decoder = new TextDecoder();
      let pending = '';

      for await (const bytes of reply.body) {
        pending += decoder.decode(bytes, { stream: true });

        // Everything before the last newline is complete; whatever follows it
        // is the start of a line the next read finishes.
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          const event = toEvent(line);
          if (event !== undefined) yield event;
        }
      }

      const last = toEvent(pending);
      if (last !== undefined) yield last;
    })();
  }

  private async post(url: string, request: GeminiRequest): Promise<HttpReply> {
    const reply = await this.http(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In a header rather than the query string, so the key cannot reach a
        // log line or an error message along with the URL.
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(request),
    });

    if (!reply.ok) {
      throw new Error(
        `Gemini answered ${String(reply.status)}: ${await reply.text()}`,
      );
    }
    return reply;
  }
}

/** One server-sent event, or nothing for the blank lines that separate them. */
function toEvent(line: string): GeminiReply | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return undefined;

  const payload = trimmed.slice('data:'.length).trim();
  return payload === '' || payload === '[DONE]'
    ? undefined
    : (JSON.parse(payload) as GeminiReply);
}
