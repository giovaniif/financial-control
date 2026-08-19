import { describe, expect, it } from 'vitest';

import { createLanguageModel } from './create-language-model.js';
import { ClaudeLanguageModel } from './claude-language-model.js';
import { MODELS } from './models.js';
import { UnavailableLanguageModel } from './unavailable-language-model.js';

/**
 * The one place the key is read. Taking the environment as an argument keeps
 * that decision testable without a test ever setting a real variable.
 */
describe('createLanguageModel', () => {
  it('builds the Claude adapter when a key is configured', () => {
    expect(
      createLanguageModel(
        { ANTHROPIC_API_KEY: 'sk-ant-test' },
        MODELS.assistant,
      ),
    ).toBeInstanceOf(ClaudeLanguageModel);
  });

  it.each([
    ['unset', {}],
    ['empty', { ANTHROPIC_API_KEY: '' }],
    ['whitespace', { ANTHROPIC_API_KEY: '   ' }],
  ])('falls back to the unavailable model when the key is %s', (_name, env) => {
    expect(createLanguageModel(env, MODELS.extraction)).toBeInstanceOf(
      UnavailableLanguageModel,
    );
  });
});
