import type { ApiError } from '@/shared/api';

const RATE_LIMITED = 429;

/**
 * Why the assistant did not answer, said as the thing that actually
 * happened.
 *
 * A wait and a breakage read differently on purpose. The spend guard refuses
 * before the model is reached, so nothing was asked and nothing was spent —
 * calling that a failure to answer names the wrong event, and the sentence
 * the server sent already carries how long the wait is.
 */
export function explainAskFailure(error: ApiError): string {
  return error.status === RATE_LIMITED
    ? error.message
    : `O assistente não conseguiu responder: ${error.message}`;
}
