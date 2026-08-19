import type {
  EstablishedRecordResponse,
  SetupTurnResponse,
} from '@fin/contracts';
import { useState } from 'react';

import {
  useCorrectSetupRecord,
  useDropSetupRecord,
} from '../api/use-setup-conversation.js';
import { parseRecord, recordName } from '../model/record-fields.js';
import { withLocalDates } from '../model/record-summary.js';

import { RecordEditor } from './record-editor.js';

interface Props {
  record: EstablishedRecordResponse;
  conversationId: string | undefined;
  onTurn: (response: SetupTurnResponse) => void;
}

/**
 * One thing the conversation understood, shown back as the app writes it and
 * correctable on the spot — UC-1.5. A correction takes the structured route:
 * it changes the draft and answers with a turn like any other, so fixing a
 * record carries the conversation on instead of restarting it.
 *
 * A record holding a single value carries no id, because the way to change the
 * anchor or the salary is to say it again. Neither affordance is offered on
 * one: there is nothing for either route to name.
 */
export function RecordLine({ record, conversationId, onTurn }: Props) {
  const [editing, setEditing] = useState(false);
  const correct = useCorrectSetupRecord();
  const drop = useDropSetupRecord();

  const parsed = parseRecord(record);
  const name = recordName(record);
  // Both routes name a record inside a conversation. Without either there is
  // nothing to act on — which is the anchor and the salary, said again rather
  // than corrected.
  const ref =
    record.id !== null && conversationId !== undefined
      ? { conversationId, recordId: record.id }
      : null;
  const pending = correct.isPending || drop.isPending;
  const refusal = correct.error?.message ?? drop.error?.message;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 size-3.5 shrink-0 text-zinc-400"
        >
          <path d="m5 13 4 4L19 7" />
        </svg>
        <span className="flex-1 text-sm text-zinc-900">
          <span className="sr-only">Recorded: </span>
          {withLocalDates(record.summary)}
        </span>

        {ref !== null && !editing && (
          <div className="flex shrink-0 gap-3">
            {parsed !== null && (
              <Quiet
                label={`Edit ${name}`}
                disabled={pending}
                onClick={() => {
                  setEditing(true);
                }}
              >
                Edit
              </Quiet>
            )}
            <Quiet
              label={`Drop ${name}`}
              disabled={pending}
              onClick={() => {
                drop.mutate(ref, { onSuccess: onTurn });
              }}
            >
              Drop
            </Quiet>
          </div>
        )}
      </div>

      {editing && parsed !== null && ref !== null && (
        <RecordEditor
          parsed={parsed}
          pending={correct.isPending}
          onCancel={() => {
            setEditing(false);
            correct.reset();
          }}
          onSave={(correction) => {
            correct.mutate(
              { ...ref, correction },
              {
                onSuccess: (response) => {
                  setEditing(false);
                  onTurn(response);
                },
              },
            );
          }}
        />
      )}

      {/* A refused correction changes nothing: the record above is still what
          the draft holds, and the rule that refused it says why. */}
      {refusal !== undefined && (
        <p role="alert" className="text-xs text-red-700">
          {refusal}
        </p>
      )}
    </div>
  );
}

/** An affordance on a record must not compete with the conversation. */
function Quiet({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
