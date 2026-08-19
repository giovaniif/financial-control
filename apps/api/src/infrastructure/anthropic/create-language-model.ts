import Anthropic from '@anthropic-ai/sdk';

import type { LanguageModel } from '../../domain/ports/language-model.js';
import {
  DEFAULT_OLLAMA_URL,
  FetchOllamaTransport,
} from '../ollama/fetch-ollama-transport.js';
import { OllamaLanguageModel } from '../ollama/ollama-language-model.js';

import { ClaudeLanguageModel } from './claude-language-model.js';
import type { ModelChoice } from './models.js';
import { UnavailableLanguageModel } from './unavailable-language-model.js';

/**
 * The one place the model behind the port is chosen, and the one place
 * `ANTHROPIC_API_KEY` is read.
 *
 * Takes the environment rather than reaching for `process.env`, so the choice
 * between a real model and none is provable in a test that never sets a real
 * variable. A blank key counts as no key: an empty string in a `.env` file is
 * how this is most often gotten wrong, and it should not produce an adapter
 * that fails on the first call with an authentication error instead of the
 * message that explains itself.
 *
 * `OLLAMA_MODEL` names a model on the local server and takes precedence —
 * FIN-118. It is what makes the whole AI flow exercisable for free and
 * without limit, and naming it is deliberate enough that a key left in `.env`
 * from ordinary use must not send the call back to the paid API. Unset, which
 * is the normal state, nothing changes: the default path is never the test
 * path.
 */
export function createLanguageModel(
  env: Partial<Record<string, string>>,
  choice: ModelChoice,
): LanguageModel {
  const localModel = env['OLLAMA_MODEL']?.trim();
  if (localModel !== undefined && localModel !== '') {
    return new OllamaLanguageModel(
      new FetchOllamaTransport(DEFAULT_OLLAMA_URL, fetch),
      {
        model: localModel,
        maxTokens: choice.maxTokens,
        maxTokensStreaming: choice.maxTokensStreaming,
      },
    );
  }

  const apiKey = env['ANTHROPIC_API_KEY']?.trim();
  if (apiKey === undefined || apiKey === '') {
    return new UnavailableLanguageModel();
  }

  return new ClaudeLanguageModel(new Anthropic({ apiKey }).messages, choice);
}
