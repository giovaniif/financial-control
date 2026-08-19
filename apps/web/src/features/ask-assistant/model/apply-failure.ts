import { ApiError } from '@/shared/api';

const REFUSED = 409;
const GONE = 404;
const MODEL_FAILED = 502;
const SWITCHED_OFF = 503;

/**
 * Why a confirmed proposal did not apply, said as the thing that actually
 * happened. The proposal stays on screen either way: a change the state
 * refused today is worth confirming again once the state has moved, and
 * collapsing every failure into one sentence hides which of those it was.
 */
export function explainApplyFailure(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'The confirmation never reached the app. Nothing was written — try again.';
  }

  switch (error.status) {
    case REFUSED:
      return `The app refused the change: ${error.message}`;
    case GONE:
      return 'This proposal is no longer on the server — ask again, and confirm the answer that comes back.';
    case SWITCHED_OFF:
      return 'The assistant is switched off, so nothing was applied.';
    case MODEL_FAILED:
      return 'The assistant could not be reached, so nothing was applied.';
    default:
      return `The change did not go through: ${error.message}`;
  }
}
