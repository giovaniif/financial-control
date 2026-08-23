import type {
  OllamaChatChunk,
  OllamaChatRequest,
  OllamaTransport,
} from './ollama-language-model.js';

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

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

/**
 * Ollama over plain HTTP. There is no SDK because there is nothing to wrap —
 * it is one REST endpoint, so `fetch` is the whole client and the model stays
 * behind the same boundary rule as everything else.
 */
export class FetchOllamaTransport implements OllamaTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly http: FetchLike,
  ) {}

  async send(request: OllamaChatRequest): Promise<OllamaChatChunk> {
    const reply = await this.post(request);
    return parseLine(await reply.text());
  }

  stream(request: OllamaChatRequest): AsyncIterable<OllamaChatChunk> {
    const post = this.post.bind(this);

    return (async function* emit(): AsyncGenerator<OllamaChatChunk> {
      const reply = await post(request);
      if (reply.body === null) {
        throw new Error('Ollama answered the stream with no body.');
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
          if (line.trim() !== '') yield parseLine(line);
        }
      }

      if (pending.trim() !== '') {
        yield parseLine(pending);
      }
    })();
  }

  private async post(request: OllamaChatRequest): Promise<HttpReply> {
    const reply = await this.http(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!reply.ok) {
      throw new Error(
        `Ollama answered ${String(reply.status)}: ${await reply.text()}`,
      );
    }
    return reply;
  }
}

function parseLine(line: string): OllamaChatChunk {
  return JSON.parse(line) as OllamaChatChunk;
}
