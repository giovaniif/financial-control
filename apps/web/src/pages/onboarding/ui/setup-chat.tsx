import type { SetupAppliedResponse, SetupTurnResponse } from '@fin/contracts';
import { useState } from 'react';
import { Link } from 'react-router';

import { useApplySetup, useSetupTurn } from '../api/use-setup-conversation.js';
import {
  applyTurn,
  draftSections,
  OPENING,
  type Entry,
} from '../model/transcript.js';

import { Composer } from './composer.js';
import { DraftReview } from './draft-review.js';
import { RecordLine } from './record-line.js';
import { SetupProgress } from './setup-progress.js';

/**
 * UC-1.5 — setup as a conversation: one question at a time, records shown back
 * as they are established and correctable where they sit, and nothing written
 * until the whole draft is read through and applied in the final step.
 */
export function SetupChat() {
  const [entries, setEntries] = useState<Entry[]>([OPENING]);
  const [latest, setLatest] = useState<SetupTurnResponse>();
  const turn = useSetupTurn();
  const apply = useApplySetup();

  // Every route the draft can change through answers with a turn, so where it
  // now stands is whatever came back last — a conversational reply, an inline
  // edit, or a drop that left a section unanswered again.
  const record = (response: SetupTurnResponse) => {
    setLatest(response);
    setEntries(applyTurn(response));
  };

  const conversationId = latest?.conversationId;
  const isComplete = latest?.isComplete ?? false;
  // Before the first turn there is nothing to ask about but the anchor.
  const nextSection = latest === undefined ? 'ANCHOR' : latest.nextSection;

  const send = (message: string) => {
    setEntries((current) => [...current, { kind: 'user', text: message }]);
    turn.mutate(
      conversationId === undefined ? { message } : { message, conversationId },
      { onSuccess: record },
    );
  };

  if (apply.data !== undefined) {
    return <Created applied={apply.data} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <p className="max-w-prose leading-7 text-zinc-600">
          This is a conversation rather than a form. I ask about one thing at a
          time — seven of them, the payday cycle first and what you are saving
          for last — and you answer however you like:{' '}
          <em>&ldquo;18k, always on the 5th&rdquo;</em>,{' '}
          <em>&ldquo;health plan 320 on the 8th&rdquo;</em>. Everything I
          understand is shown back as you go, and nothing is written until you
          have read the whole draft at the end.
        </p>
        <SetupProgress next={isComplete ? null : nextSection} />
      </div>

      <div
        role="log"
        aria-label="Setup conversation"
        className="flex flex-col gap-5"
      >
        <ol className="flex flex-col gap-5">
          {entries.map((entry, index) => (
            <li key={index}>
              {entry.kind === 'record' ? (
                <RecordLine
                  record={entry}
                  conversationId={conversationId}
                  onTurn={record}
                />
              ) : (
                <Line entry={entry} />
              )}
            </li>
          ))}
        </ol>
      </div>

      {turn.isPending && <Thinking />}

      {turn.isError && (
        <p role="alert" className="text-sm text-red-700">
          {turn.error.message}
        </p>
      )}

      {isComplete ? (
        <DraftReview
          sections={draftSections(entries)}
          disabled={apply.isPending || conversationId === undefined}
          onCreate={() => {
            if (conversationId !== undefined) {
              apply.mutate(conversationId);
            }
          }}
          error={apply.error?.message}
        />
      ) : (
        <Composer disabled={turn.isPending} onSend={send} />
      )}
    </div>
  );
}

/**
 * The two voices. Who is speaking is carried visually by where the line sits
 * and what it sits on, and named for a screen reader, which has neither.
 */
function Line({ entry }: { entry: Exclude<Entry, { kind: 'record' }> }) {
  if (entry.kind === 'correction') {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 size-4 shrink-0"
        >
          <path d="M12 8v5" />
          <path d="M12 16.5h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        <span>{entry.text}</span>
      </div>
    );
  }

  if (entry.kind === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-100 px-4 py-2.5 text-sm whitespace-pre-line text-zinc-900">
          <span className="sr-only">You</span>
          {entry.text}
        </p>
      </div>
    );
  }

  return (
    <p className="max-w-prose text-[15px] leading-7 text-zinc-800">
      <span className="sr-only">Claude</span>
      {entry.text}
    </p>
  );
}

/** Tens of seconds on a local model, so it reads as thinking, not as status. */
function Thinking() {
  return (
    <p
      role="status"
      className="flex items-center gap-2.5 text-sm text-zinc-500"
    >
      <span aria-hidden="true" className="flex items-center gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400" />
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:200ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:400ms]" />
      </span>
      Working out what you just told me…
    </p>
  );
}

function Created({ applied }: { applied: SetupAppliedResponse }) {
  const shift = applied.shiftPolicy === 'PRECEDING' ? 'preceding' : 'following';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Your setup is in
        </h2>
        <p className="max-w-prose leading-7 text-zinc-600">
          Paid on day {applied.anchorDay}, moving to the {shift} business day
          when that one is closed.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-zinc-700">
        <li>{count(applied.accounts, 'account')}</li>
        <li>{applied.templates} recurring bills and income</li>
        <li>{count(applied.cards, 'credit card')}</li>
        <li>{count(applied.buckets, 'bucket')}</li>
      </ul>
      <div>
        <Link
          to="/"
          className="inline-block rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
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
