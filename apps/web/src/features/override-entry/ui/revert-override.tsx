import { formatBRL } from '@/shared/lib';
import { Button } from '@/shared/ui';

import { useRevertOverride } from '../api/use-revert-override.js';

interface Props {
  month: string;
  entryId: string;
  description: string;
  /** Signed, as the ledger signs it. What the template projected. */
  projectedAmount: number;
}

/**
 * UC-3.7 — the way back from an override, in one action.
 *
 * The amount is in the label rather than behind a confirmation. A discard
 * whose result is visible before it happens needs no second step, and a
 * dialog asking "are you sure?" about a reversible change is a step that
 * teaches the user to click through it.
 */
export function RevertOverride({
  month,
  entryId,
  description,
  projectedAmount,
}: Props) {
  const revert = useRevertOverride();
  const amount = formatBRL(projectedAmount);

  return (
    <Button
      aria-label={`Voltar ${description} ao valor previsto de ${amount}`}
      disabled={revert.isPending}
      onClick={() => {
        revert.mutate({ month, entryId });
      }}
    >
      Voltar ao previsto ({amount})
    </Button>
  );
}
