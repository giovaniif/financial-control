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
    return 'A confirmação não chegou ao app. Nada foi escrito — tente de novo.';
  }

  switch (error.status) {
    case REFUSED:
      return `O app recusou a mudança: ${error.message}`;
    case GONE:
      return 'Essa proposta não está mais no servidor — pergunte de novo e confirme a resposta que vier.';
    case SWITCHED_OFF:
      return 'O assistente está desligado, então nada foi aplicado.';
    case MODEL_FAILED:
      return 'Não foi possível falar com o assistente, então nada foi aplicado.';
    default:
      return `A mudança não foi aplicada: ${error.message}`;
  }
}
