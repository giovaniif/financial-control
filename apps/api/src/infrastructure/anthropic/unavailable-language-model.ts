import type {
  LanguageModel,
  ModelResponse,
  ModelStreamEvent,
} from '../../domain/ports/language-model.js';
import { LanguageModelUnavailable } from '../../domain/ports/language-model.js';

const REASON =
  'Nenhuma ANTHROPIC_API_KEY está configurada, então o assistente está desligado. Todo o resto do app funciona sem ele.';

/**
 * The model when there is no key.
 *
 * Wired by the composition root instead of the real adapter, so that running
 * without a key fails one call with a typed error the UI explains — rather
 * than failing at startup, which would make the key a precondition for
 * reading your own numbers.
 */
export class UnavailableLanguageModel implements LanguageModel {
  readonly isAvailable = false;

  complete(): Promise<ModelResponse> {
    return Promise.reject(new LanguageModelUnavailable(REASON));
  }

  /** Rejects on the first read, so a caller's `for await` fails as it would
   *  against a real model that could not be reached. */
  stream(): AsyncIterable<ModelStreamEvent> {
    return {
      [Symbol.asyncIterator]: (): AsyncIterator<ModelStreamEvent> => ({
        next: () => Promise.reject(new LanguageModelUnavailable(REASON)),
      }),
    };
  }
}
