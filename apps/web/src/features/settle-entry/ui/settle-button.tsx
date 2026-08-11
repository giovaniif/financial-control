import { Button } from '@/shared/ui';

import { useSettleEntry } from '../api/use-settle-entry.js';

interface Props {
  month: string;
  entryId: string;
  /** Money in is received; money out is paid. */
  isIncoming: boolean;
  label?: string;
}

/** One click when the actual equals the planned amount. */
export function SettleButton({ month, entryId, isIncoming, label }: Props) {
  const settle = useSettleEntry();

  return (
    <Button
      variant="secondary"
      disabled={settle.isPending}
      onClick={() => {
        settle.mutate({
          month,
          entryId,
          status: isIncoming ? 'RECEIVED' : 'PAID',
        });
      }}
    >
      {label ?? (isIncoming ? 'Confirm' : 'Settle')}
    </Button>
  );
}
