import { describe, expect, it } from 'vitest';

import {
  LanguageModelUnavailable,
  type LanguageModel,
  type ModelStreamEvent,
} from '../../domain/ports/language-model.js';

import { UnavailableLanguageModel } from './unavailable-language-model.js';

const request = { system: '', messages: [], tools: [] };

/** Held as the port, because that is the only way anything ever calls it. */
const model = (): LanguageModel => new UnavailableLanguageModel();

async function drain(
  events: AsyncIterable<ModelStreamEvent>,
): Promise<ModelStreamEvent[]> {
  const seen: ModelStreamEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

/**
 * Running without a key is a state the app is expected to be in, so it fails
 * per call with a typed error the UI can explain — not at startup, which
 * would make the key a precondition for reading your own numbers.
 */
describe('UnavailableLanguageModel', () => {
  it('rejects a completion with the typed error', async () => {
    await expect(model().complete(request)).rejects.toBeInstanceOf(
      LanguageModelUnavailable,
    );
  });

  it('rejects a stream with the typed error', async () => {
    await expect(drain(model().stream(request))).rejects.toBeInstanceOf(
      LanguageModelUnavailable,
    );
  });

  it('names the missing key so the cause is actionable', async () => {
    await expect(model().complete(request)).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });
});
