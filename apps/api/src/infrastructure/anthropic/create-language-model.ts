import Anthropic from '@anthropic-ai/sdk';

import type { LanguageModel } from '../../domain/ports/language-model.js';

import { ClaudeLanguageModel } from './claude-language-model.js';
import type { ModelChoice } from './models.js';
import { UnavailableLanguageModel } from './unavailable-language-model.js';

/**
 * The one place `ANTHROPIC_API_KEY` is read.
 *
 * Takes the environment rather than reaching for `process.env`, so the choice
 * between a real model and none is provable in a test that never sets a real
 * variable. A blank key counts as no key: an empty string in a `.env` file is
 * how this is most often gotten wrong, and it should not produce an adapter
 * that fails on the first call with an authentication error instead of the
 * message that explains itself.
 */
export function createLanguageModel(
  env: Partial<Record<string, string>>,
  choice: ModelChoice,
): LanguageModel {
  const apiKey = env['ANTHROPIC_API_KEY']?.trim();
  if (apiKey === undefined || apiKey === '') {
    return new UnavailableLanguageModel();
  }

  return new ClaudeLanguageModel(new Anthropic({ apiKey }).messages, choice);
}
