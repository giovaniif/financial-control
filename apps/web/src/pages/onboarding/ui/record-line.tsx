import type {
  EstablishedRecordResponse,
  SetupTurnResponse,
} from '@fin/contracts';
import { useState } from 'react';

import { Badge, Button } from '@/shared/ui';

import {
  useCorrectSetupRecord,
  useDropSetupRecord,
} from '../api/use-setup-conversation.js';
import { parseRecord, recordName } from '../model/record-fields.js';
import { withLocalDates } from '../model/record-summary.js';
import { SECTION_LABELS } from '../model/sections.js';

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
  const name = recordName(record.summary);
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
    <div className="flex flex-col gap-1 rounded-lg bg-green-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="positive">Recorded</Badge>
        <span className="text-xs text-zinc-500">
          {SECTION_LABELS[record.section]}
        </span>
        <span className="flex-1 text-zinc-900">
          {withLocalDates(record.summary)}
        </span>

        {ref !== null && !editing && (
          <div className="flex gap-2">
            {parsed !== null && (
              <Button
                aria-label={`Edit ${name}`}
                disabled={pending}
                onClick={() => {
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
            <Button
              aria-label={`Drop ${name}`}
              disabled={pending}
              onClick={() => {
                drop.mutate(ref, { onSuccess: onTurn });
              }}
            >
              Drop
            </Button>
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
