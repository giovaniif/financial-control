import type { DownstreamShiftResponse } from '@fin/contracts';
import { useState } from 'react';

import { Amount, Button, Dialog, Skeleton } from '@/shared/ui';

import {
  useCloseCycle,
  useReopenCycle,
  useReopenPreview,
} from '../api/use-close-cycle.js';

interface Props {
  month: string;
  label: string;
  status: 'OPEN' | 'CLOSED';
  /** Closing is offered once the cycle's end date has passed, never before. */
  hasEnded: boolean;
  unsettled: number;
}

/** UC-3.8 and UC-3.9 — freezing a cycle, and the warning before undoing it. */
export function CloseCycle({
  month,
  label,
  status,
  hasEnded,
  unsettled,
}: Props) {
  if (status === 'CLOSED') {
    return <Reopen month={month} label={label} />;
  }
  // Offered once the cycle is over, never forced and never early.
  return hasEnded ? (
    <Close month={month} label={label} unsettled={unsettled} />
  ) : null;
}

function Close({
  month,
  label,
  unsettled,
}: {
  month: string;
  label: string;
  unsettled: number;
}) {
  const [open, setOpen] = useState(false);
  const close = useCloseCycle(month);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Close the cycle
      </Button>
      <Dialog
        open={open}
        title={`Close ${label}`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600">
            Closing freezes {label}: its entries become read-only, and its
            closing balance becomes the next cycle&rsquo;s opening balance.
          </p>
          {unsettled > 0 && (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              {unsettled} {unsettled === 1 ? 'entry is' : 'entries are'} still
              unsettled. Settle or skip {unsettled === 1 ? 'it' : 'them'} first.
            </p>
          )}
          <Button
            variant="primary"
            disabled={unsettled > 0 || close.isPending}
            onClick={() => {
              close.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                },
              });
            }}
          >
            Close {label}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function Reopen({ month, label }: { month: string; label: string }) {
  const [open, setOpen] = useState(false);
  const preview = useReopenPreview(month, open);
  const reopen = useReopenCycle(month);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Reopen the cycle
      </Button>
      <Dialog
        open={open}
        title={`Reopen ${label}`}
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className="flex flex-col gap-3">
          {preview.isPending || preview.data === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              {/* Reopening a cycle four back shifts the entire cash curve
                  since, so every balance that moves is named first. */}
              <p className="text-sm text-zinc-600">
                {preview.data.shifts.length === 0
                  ? 'No later cycle changes.'
                  : `${String(preview.data.shifts.length)} later cycles would open at a different balance.`}
              </p>
              {preview.data.shifts.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 text-xs">
                  {preview.data.shifts.map((shift) => (
                    <Shift key={shift.month} shift={shift} />
                  ))}
                </ul>
              )}
              <Button
                variant="primary"
                disabled={reopen.isPending}
                onClick={() => {
                  reopen.mutate(undefined, {
                    onSuccess: () => {
                      setOpen(false);
                    },
                  });
                }}
              >
                Reopen
              </Button>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}

function Shift({ shift }: { shift: DownstreamShiftResponse }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span>{labelOf(shift.month)}</span>
      <span className="flex items-baseline gap-2">
        <Amount
          cents={shift.currentOpening}
          className="text-zinc-400 line-through"
        />
        <Amount cents={shift.recomputedOpening} />
      </span>
    </li>
  );
}

/** `2026-07` as `July 2026` — a cycle is named for the month it opens in. */
function labelOf(month: string): string {
  const [year, index = '01'] = month.split('-');

  return `${new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  }).format(
    new Date(`${String(year)}-${index}-01T00:00:00.000Z`),
  )} ${String(year)}`;
}
