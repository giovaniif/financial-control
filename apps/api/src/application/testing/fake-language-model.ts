import { DomainError } from '../../domain/shared/domain-error.js';
import type {
  LanguageModel,
  ModelRequest,
  ModelResponse,
  ModelStopReason,
  ModelStreamEvent,
  ToolCall,
} from '../../domain/ports/language-model.js';

/** One scripted turn. Omit what the turn does not produce. */
export interface ScriptedTurn {
  text?: string;
  toolCalls?: readonly ToolCall[];
  /** Defaults to what the turn's content implies; set it to script a refusal. */
  stopReason?: ModelStopReason;
}

export class ScriptExhausted extends DomainError {}

/**
 * A model that says what the test told it to say.
 *
 * Scripted rather than mocked: a test states the conversation it wants and
 * asserts on the outcome, instead of asserting on calls that a refactor would
 * invalidate. Running past the end of the script throws — an empty response
 * there would make a broken interactor look green, which is the one failure a
 * test double must never produce.
 */
export class FakeLanguageModel implements LanguageModel {
  readonly requests: ModelRequest[] = [];
  private next = 0;

  constructor(private readonly script: readonly ScriptedTurn[]) {}

  /**
   * `async` so running out of script rejects rather than throwing out of the
   * call itself. A caller that handles failure with `.catch()` would miss a
   * synchronous throw, and the real adapter rejects.
   */
  async complete(request: ModelRequest): Promise<ModelResponse> {
    return Promise.resolve(this.take(request));
  }

  /** Takes its turn on first iteration: a stream nobody reads asks nothing. */
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const take = (): ModelResponse => this.take(request);
    // The port is an AsyncIterable because a real model arrives over the
    // network; a scripted one has its whole answer in hand and nothing to
    // await. Matching the port matters more than the shape of this double.
    // eslint-disable-next-line @typescript-eslint/require-await
    return (async function* emit(): AsyncGenerator<ModelStreamEvent> {
      const response = take();
      for (const delta of splitIntoDeltas(response.text)) {
        yield { kind: 'text', delta };
      }
      for (const call of response.toolCalls) {
        yield { kind: 'toolCall', call };
      }
      yield { kind: 'done', response };
    })();
  }

  private take(request: ModelRequest): ModelResponse {
    this.requests.push(request);

    const turn = this.script[this.next];
    if (turn === undefined) {
      throw new ScriptExhausted(
        `The model was asked ${String(this.next + 1)} time(s) but the script has ${String(this.script.length)} turn(s).`,
      );
    }
    this.next += 1;

    const toolCalls = turn.toolCalls ?? [];
    return {
      text: turn.text ?? '',
      toolCalls,
      stopReason:
        turn.stopReason ?? (toolCalls.length > 0 ? 'toolCalls' : 'end'),
    };
  }
}

/**
 * Streaming exists so a long answer appears as it is written, so the fake has
 * to arrive in more than one piece for a test to prove anything about it.
 * Word boundaries are as good a split as any and keep the expectations
 * readable.
 */
function splitIntoDeltas(text: string): string[] {
  if (text === '') return [];
  return text.split(/(?=\s)/);
}
