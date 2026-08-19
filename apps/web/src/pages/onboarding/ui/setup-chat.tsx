import type {
  SetupAppliedResponse,
  SetupSection,
  SetupTurnResponse,
} from '@fin/contracts';
import { useEffect, useRef, useState } from 'react';
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
import { ExampleAnswers } from './example-answers.js';
import { RecordLine } from './record-line.js';

interface Props {
  /** What the conversation is asking about now, for the path in the bar. */
  onAsking: (section: SetupSection | null) => void;
}

/**
 * UC-1.5 — setup as a conversation: one question at a time, records shown back
 * as they are established and correctable where they sit, and nothing written
 * until the whole draft is read through and applied in the final step.
 *
 * The two arrangements below — a greeting with the composer under it, and the
 * transcript with the composer pinned beneath — are one tree with two sets of
 * classes rather than two trees, so that the first answer sent does not unmount
 * the field it was typed in and take the focus with it.
 */
export function SetupChat({ onAsking }: Props) {
  const [entries, setEntries] = useState<Entry[]>([OPENING]);
  const [latest, setLatest] = useState<SetupTurnResponse>();
  const [draft, setDraft] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const turn = useSetupTurn();
  const apply = useApplySetup();

  // Every route the draft can change through answers with a turn, so where it
  // now stands is whatever came back last — a conversational reply, an inline
  // edit, or a drop that left a section unanswered again.
  const record = (response: SetupTurnResponse) => {
    setLatest(response);
    setEntries(applyTurn(response));
    onAsking(response.isComplete ? null : response.nextSection);
  };

  const conversationId = latest?.conversationId;
  const isComplete = latest?.isComplete ?? false;
  const hasSpoken = entries.some((entry) => entry.kind === 'user');

  // A new turn belongs at the bottom of the transcript and in view — including
  // the thinking line, which is what says the answer was taken.
  useEffect(() => {
    const region = transcript.current;
    if (region !== null) {
      region.scrollTop = region.scrollHeight;
    }
  }, [entries, turn.isPending]);

  const send = (message: string) => {
    setEntries((current) => [...current, { kind: 'user', text: message }]);
    turn.mutate(
      conversationId === undefined ? { message } : { message, conversationId },
      { onSuccess: record },
    );
  };

  if (apply.data !== undefined) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-10">
        <div className="mx-auto w-full max-w-2xl">
          <Created applied={apply.data} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        hasSpoken
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-8'
      }
    >
      {hasSpoken ? null : (
        <p className="w-full max-w-2xl text-sm text-zinc-500">
          Setting up is a conversation — seven questions, answered however you
          like. Nothing is written until you have read the whole draft at the
          end.
        </p>
      )}

      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex --
          Once the transcript is the region that scrolls, WCAG 2.1.1 requires
          it to be reachable by keyboard, and a turn can hold no control at all
          for a tab stop to land on. Before the first answer it scrolls nothing
          and takes no stop. */}
      <div
        ref={transcript}
        role="log"
        aria-label="Setup conversation"
        tabIndex={hasSpoken ? 0 : undefined}
        className={
          hasSpoken
            ? 'min-h-0 flex-1 overflow-y-auto px-4 py-6'
            : 'w-full max-w-2xl'
        }
      >
        <div
          className={
            hasSpoken
              ? 'mx-auto flex w-full max-w-2xl flex-col gap-5'
              : 'flex flex-col gap-5'
          }
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

          {turn.isPending && <Thinking />}

          {turn.isError && (
            <p role="alert" className="text-sm text-red-700">
              {turn.error.message}
            </p>
          )}

          {isComplete && (
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
          )}
        </div>
      </div>
      {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}

      {isComplete ? null : (
        <div
          className={
            hasSpoken
              ? 'shrink-0 border-t border-zinc-200 bg-white px-4 pt-3 pb-4'
              : 'w-full max-w-2xl'
          }
        >
          <div className="mx-auto w-full max-w-2xl">
            <Composer
              ref={composer}
              value={draft}
              onChange={setDraft}
              disabled={turn.isPending}
              onSend={send}
            />
          </div>
        </div>
      )}

      {hasSpoken ? null : (
        <div className="w-full max-w-2xl">
          <ExampleAnswers
            onPick={(example) => {
              setDraft(example);
              composer.current?.focus();
            }}
          />
        </div>
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
