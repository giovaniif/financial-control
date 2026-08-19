import { describe, expect, it } from 'vitest';

import { OllamaLanguageModel } from '../ollama/ollama-language-model.js';

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

/**
 * FIN-118 — the same port, answered locally. Selection is by environment, and
 * an unset variable keeps Anthropic: the default path is never the test path.
 */
describe('createLanguageModel against a local model', () => {
  it('builds the Ollama adapter when a local model is named', () => {
    expect(
      createLanguageModel({ OLLAMA_MODEL: 'qwen2.5:7b' }, MODELS.assistant),
    ).toBeInstanceOf(OllamaLanguageModel);
  });

  // Naming a local model is a deliberate act; a key left in `.env` from
  // ordinary use must not quietly send the call back to the paid API.
  it('prefers the local model over a configured key', () => {
    expect(
      createLanguageModel(
        { ANTHROPIC_API_KEY: 'sk-ant-test', OLLAMA_MODEL: 'qwen2.5:7b' },
        MODELS.extraction,
      ),
    ).toBeInstanceOf(OllamaLanguageModel);
  });

  it.each([
    ['unset', {}],
    ['empty', { OLLAMA_MODEL: '' }],
    ['whitespace', { OLLAMA_MODEL: '  ' }],
  ])('keeps Claude when the local model is %s', (_name, env) => {
    expect(
      createLanguageModel(
        { ANTHROPIC_API_KEY: 'sk-ant-test', ...env },
        MODELS.assistant,
      ),
    ).toBeInstanceOf(ClaudeLanguageModel);
  });

  // Free, unlimited testing is the point: it cannot require a paid key to
  // reach the path that avoids one.
  it('needs no Anthropic key to answer locally', () => {
    expect(
      createLanguageModel({ OLLAMA_MODEL: 'qwen2.5:7b' }, MODELS.extraction),
    ).not.toBeInstanceOf(UnavailableLanguageModel);
  });
});
