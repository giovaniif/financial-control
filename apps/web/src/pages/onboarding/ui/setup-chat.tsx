import type {
  EstablishedRecordResponse,
  SetupAppliedResponse,
  SetupTurnResponse,
} from '@fin/contracts';
import { useId, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';

import { Badge, Button } from '@/shared/ui';

import { useApplySetup, useSetupTurn } from '../api/use-setup-conversation.js';
import { describeProgress, SECTION_LABELS } from '../model/sections.js';
import { withLocalDates } from '../model/record-summary.js';

type Entry =
  | { kind: 'assistant' | 'user' | 'correction'; text: string }
  | ({ kind: 'record' } & EstablishedRecordResponse);

/**
 * The server cannot say the first line — it answers a message, and there is
 * none yet — so the conversation opens on the section that always comes first.
 */
const OPENING: Entry = {
  kind: 'assistant',
  text: "Let's start with the payday cycle. Which day of the month are you paid, and when that day falls on a weekend or a holiday, should the money land before it or after?",
};

/**
 * UC-1.5 — setup as a conversation: one question at a time, records shown back
 * as they are established, and nothing written until the whole draft is
 * applied in the final step.
 */
export function SetupChat() {
  const answerId = useId();
  const [entries, setEntries] = useState<Entry[]>([OPENING]);
  const [answer, setAnswer] = useState('');
  const turn = useSetupTurn();
  const apply = useApplySetup();

  const conversationId = turn.data?.conversationId;
  const isComplete = turn.data?.isComplete ?? false;
  // Before the first turn there is nothing to ask about but the anchor.
  const nextSection =
    turn.data === undefined ? 'ANCHOR' : turn.data.nextSection;

  const send = (event: SyntheticEvent) => {
    event.preventDefault();
    const message = answer.trim();
    if (message === '' || turn.isPending) {
      return;
    }

    setEntries((current) => [...current, { kind: 'user', text: message }]);
    setAnswer('');
    turn.mutate(
      conversationId === undefined ? { message } : { message, conversationId },
      {
        onSuccess: (response) => {
          setEntries(append(response));
        },
      },
    );
  };

  if (apply.data !== undefined) {
    return <Created applied={apply.data} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        Answer however you like — <em>&ldquo;18k, always on the 5th&rdquo;</em>,{' '}
        <em>&ldquo;health plan 320 on the 8th&rdquo;</em>. Nothing is written
        until the whole draft is created at the end.
      </p>

      <div
        role="log"
        aria-label="Setup conversation"
        className="rounded-xl border border-zinc-200 bg-white p-4"
      >
        <ol className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <li key={index}>
              <Line entry={entry} />
            </li>
          ))}
        </ol>
      </div>

      {turn.isPending && (
        <p role="status" className="text-sm text-zinc-500">
          Working out what you just told me…
        </p>
      )}

      {turn.isError && (
        <p role="alert" className="text-sm text-red-700">
          {turn.error.message}
        </p>
      )}

      {!isComplete && nextSection !== null && (
        <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          {describeProgress(nextSection)}
        </p>
      )}

      {isComplete ? (
        <Ready
          disabled={apply.isPending || conversationId === undefined}
          onCreate={() => {
            if (conversationId !== undefined) {
              apply.mutate(conversationId);
            }
          }}
          error={apply.error?.message}
        />
      ) : (
        <form onSubmit={send} className="flex flex-col gap-2">
          <label
            htmlFor={answerId}
            className="text-xs font-medium text-zinc-600"
          >
            Your answer
          </label>
          <textarea
            id={answerId}
            rows={3}
            value={answer}
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <div>
            <Button type="submit" variant="primary" disabled={turn.isPending}>
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Established records first, then whatever was refused, then what to say next
 * — the order the turn happened in, so a correction reads as the reason for
 * the question that follows it.
 */
function append(response: SetupTurnResponse) {
  return (current: Entry[]): Entry[] => [
    ...current,
    ...response.established.map((record) => ({
      kind: 'record' as const,
      ...record,
    })),
    ...response.corrections.map((text) => ({
      kind: 'correction' as const,
      text,
    })),
    { kind: 'assistant' as const, text: response.message },
  ];
}

function Line({ entry }: { entry: Entry }) {
  if (entry.kind === 'record') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm">
        <Badge tone="positive">Recorded</Badge>
        <span className="text-xs text-zinc-500">
          {SECTION_LABELS[entry.section]}
        </span>
        <span className="text-zinc-900">{withLocalDates(entry.summary)}</span>
      </div>
    );
  }

  if (entry.kind === 'correction') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
        <Badge tone="warning">Not recorded</Badge>
        <span className="text-zinc-900">{entry.text}</span>
      </div>
    );
  }

  const mine = entry.kind === 'user';

  return (
    <div
      className={mine ? 'flex flex-col items-end gap-1' : 'flex flex-col gap-1'}
    >
      <span className="text-xs text-zinc-500">{mine ? 'You' : 'Claude'}</span>
      <span
        className={`max-w-prose rounded-lg px-3 py-2 text-sm ${
          mine ? 'bg-zinc-900 text-zinc-50' : 'bg-zinc-100 text-zinc-900'
        }`}
      >
        {entry.text}
      </span>
    </div>
  );
}

function Ready({
  disabled,
  onCreate,
  error,
}: {
  disabled: boolean;
  onCreate: () => void;
  error: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-900 p-4">
      <h2 className="font-semibold">Every section is answered</h2>
      <p className="text-sm text-zinc-600">
        Nothing has been written yet. Creating applies the whole draft at once,
        and everything in it stays editable afterwards.
      </p>
      <div>
        <Button variant="primary" disabled={disabled} onClick={onCreate}>
          Create everything
        </Button>
      </div>
      {error !== undefined && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function Created({ applied }: { applied: SetupAppliedResponse }) {
  const shift = applied.shiftPolicy === 'PRECEDING' ? 'preceding' : 'following';

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Your setup is in</h2>
      <p className="text-zinc-600">
        Paid on day {applied.anchorDay}, moving to the {shift} business day when
        that one is closed.
      </p>
      <ul className="flex flex-col gap-1 text-sm text-zinc-700">
        <li>{count(applied.accounts, 'account')}</li>
        <li>{applied.templates} recurring bills and income</li>
        <li>{count(applied.cards, 'credit card')}</li>
        <li>{count(applied.buckets, 'bucket')}</li>
      </ul>
      <div>
        <Link
          to="/"
          className="inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
        >
          Open Main
        </Link>
      </div>
    </div>
  );
}

function count(total: number, noun: string): string {
  return `${String(total)} ${noun}${total === 1 ? '' : 's'}`;
}
