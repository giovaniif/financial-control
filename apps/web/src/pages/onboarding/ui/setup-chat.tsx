import type { SetupAppliedResponse, SetupTurnResponse } from '@fin/contracts';
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
export function SetupChat() {
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex --
          The transcript is the region that scrolls, so WCAG 2.1.1 requires it
          to be reachable by keyboard, and a turn can hold no control at all
          for a tab stop to land on. */}
      <div
        ref={transcript}
        role="log"
        aria-label="Conversa de configuração"
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6"
      >
        {/* mt-auto rather than justify-end: a short conversation sits against
            the composer and grows upward, and a long one still scrolls from
            the top instead of overflowing where it cannot be reached. */}
        <div className="mx-auto mt-auto flex w-full max-w-2xl flex-col gap-5">
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
        <div className="shrink-0 border-t border-zinc-200 bg-white px-4 pt-3 pb-4">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2.5">
            {/* Suggested replies, the way a chat offers them: beside the
                composer, and only until there is a conversation to read. */}
            {hasSpoken ? null : (
              <ExampleAnswers
                onPick={(example) => {
                  setDraft(example);
                  composer.current?.focus();
                }}
              />
            )}
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
          <span className="sr-only">Você</span>
          {entry.text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      {/* The mirror of an answer: same shape, squared on the side it comes
          from, and a bordered white surface so the two read apart on tone
          rather than only on which edge they sit against. */}
      <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-2.5 text-sm leading-6 whitespace-pre-line text-zinc-800">
        <span className="sr-only">Claude</span>
        {entry.text}
      </p>
    </div>
  );
}

/** Tens of seconds on a local model, so it reads as thinking, not as status. */
/** Waiting arrives where the answer will: the same bubble, not yet filled. */
function Thinking() {
  return (
    <p
      role="status"
      className="flex max-w-[85%] items-center gap-2.5 self-start rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500"
    >
      <span aria-hidden="true" className="flex items-center gap-1">
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400" />
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:200ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:400ms]" />
      </span>
      Processando o que você acabou de me contar…
    </p>
  );
}

function Created({ applied }: { applied: SetupAppliedResponse }) {
  const shift = applied.shiftPolicy === 'PRECEDING' ? 'anterior' : 'seguinte';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">
          Sua configuração está pronta
        </h2>
        <p className="max-w-prose leading-7 text-zinc-600">
          Pago no dia {applied.anchorDay}, movendo para o dia útil {shift}{' '}
          quando esse estiver fechado.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-zinc-700">
        <li>{count(applied.accounts, 'conta', 'contas')}</li>
        <li>{applied.templates} contas e receitas recorrentes</li>
        <li>
          {count(applied.cards, 'cartão de crédito', 'cartões de crédito')}
        </li>
        <li>{count(applied.buckets, 'caixinha', 'caixinhas')}</li>
      </ul>
      <div>
        <Link
          to="/"
          className="inline-block rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
        >
          Abrir o Principal
        </Link>
      </div>
    </div>
  );
}

function count(total: number, singular: string, plural: string): string {
  return `${String(total)} ${total === 1 ? singular : plural}`;
}
