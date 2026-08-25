import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import { explainAskFailure } from './ask-failure.js';

const failed = (status: number, message: string) =>
  new ApiError(status, '/assistant/messages', message);

describe('why the assistant did not answer', () => {
  /**
   * Nothing was asked and nothing was spent, so calling it a failure to
   * answer describes the wrong event. The server's sentence already carries
   * the wait, and it is the same wait the `retry-after` header names.
   */
  it('lets a rate limit speak for itself', () => {
    expect(
      explainAskFailure(
        failed(
          429,
          'Requisições demais ao assistente. Tente de novo em 1 minuto.',
        ),
      ),
    ).toBe('Requisições demais ao assistente. Tente de novo em 1 minuto.');
  });

  it('says the assistant could not answer when something actually broke', () => {
    expect(
      explainAskFailure(failed(502, 'O modelo parou antes de responder.')),
    ).toBe(
      'O assistente não conseguiu responder: O modelo parou antes de responder.',
    );
  });
});
