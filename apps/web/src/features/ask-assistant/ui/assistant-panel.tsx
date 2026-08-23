import type { AssistantReadResponse } from '@fin/contracts';
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';

import { ApiError, useSetupState } from '@/shared/api';
import { Badge, Button, Card, CardTitle } from '@/shared/ui';

import { useAskAssistant } from '../api/use-ask-assistant.js';
import {
  loadConversation,
  saveConversation,
  withApplied,
  withoutProposal,
  type Conversation,
  type TranscriptEntry,
} from '../model/conversation.js';
import { ProposalCard } from './proposal-card.js';

const SWITCHED_OFF = 503;

/** What has arrived of the answer being written right now. */
interface Streaming {
  text: string;
  reads: AssistantReadResponse[];
}

/**
 * UC-8 — the assistant: how the app answers the questions its screens did not
 * anticipate. It reads the same figures the screens read, states no number it
 * worked out itself, and every change it offers waits on a confirmation.
 */
export function AssistantPanel() {
  const questionId = useId();
  const setup = useSetupState();
  const [conversation, setConversation] =
    useState<Conversation>(loadConversation);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  // The frames arrive from outside React's own scheduling, so what has been
  // written so far is held where a handler can read it as well as set it.
  const written = useRef<Streaming | null>(null);

  const write = (next: Streaming | null) => {
    written.current = next;
    setStreaming(next);
  };
  const append = (change: (current: Streaming) => Streaming) => {
    if (written.current !== null) {
      write(change(written.current));
    }
  };

  const ask = useAskAssistant({
    onText: (delta) => {
      append((current) => ({ ...current, text: current.text + delta }));
    },
    onRead: (read) => {
      append((current) => ({ ...current, reads: [...current.reads, read] }));
    },
    onTurn: (turn) => {
      write(null);
      setConversation((current) => ({
        conversationId: turn.conversationId,
        entries: [
          ...current.entries,
          {
            kind: 'answer',
            text: turn.message,
            reads: turn.reads,
            proposals: turn.proposals.map((proposal) => ({
              proposal,
              isApplied: false,
            })),
            wasRefused: turn.wasRefused,
            hitReadLimit: turn.hitReadLimit,
          },
        ],
      }));
    },
  });

  useEffect(() => {
    saveConversation(conversation);
  }, [conversation]);

  const send = (event: SyntheticEvent) => {
    event.preventDefault();
    const message = question.trim();
    if (message === '' || ask.isPending) {
      return;
    }

    const { conversationId } = conversation;
    setConversation((current) => ({
      ...current,
      entries: [...current.entries, { kind: 'question', text: message }],
    }));
    setQuestion('');
    write({ text: '', reads: [] });

    ask.mutate(
      conversationId === null ? { message } : { message, conversationId },
      {
        onSettled: () => {
          // Whatever had been written when the stream ended is kept: half an
          // answer is still worth reading, and the reason it stopped is said
          // beneath it.
          const partial = written.current;
          if (partial !== null && partial.text !== '') {
            setConversation((current) => ({
              ...current,
              entries: [
                ...current.entries,
                {
                  kind: 'answer',
                  text: partial.text,
                  reads: partial.reads,
                  proposals: [],
                  wasRefused: false,
                  hitReadLimit: false,
                },
              ],
            }));
          }
          write(null);
        },
      },
    );
  };

  const failure = ask.error instanceof ApiError ? ask.error : null;
  const isSwitchedOff =
    setup.data?.assistantAvailable === false ||
    failure?.status === SWITCHED_OFF;

  return (
    <Card className="flex flex-col gap-4" label="Assistant">
      <CardTitle>Ask</CardTitle>
      <p className="text-sm text-zinc-600">
        Ask about any figure, or say what changed. Every change is proposed
        first — nothing is written until you confirm it.
      </p>

      <div
        role="log"
        aria-label="Assistant conversation"
        className="flex flex-col gap-3"
      >
        {conversation.entries.length === 0 && streaming === null && (
          <p className="text-sm text-zinc-500">
            Nothing asked yet. Try{' '}
            <em>&ldquo;why is September lower than August?&rdquo;</em>
          </p>
        )}

        <ol className="flex flex-col gap-3">
          {conversation.entries.map((entry, index) => (
            <li key={index}>
              <Line
                entry={entry}
                onApplied={(proposalId) => {
                  setConversation((current) =>
                    withApplied(current, proposalId),
                  );
                }}
                onDismiss={(proposalId) => {
                  setConversation((current) =>
                    withoutProposal(current, proposalId),
                  );
                }}
              />
            </li>
          ))}
        </ol>

        {/* Polite, never assertive: a live region that interrupts on every
            token is unusable with a screen reader. */}
        {streaming !== null && (
          <div
            aria-live="polite"
            aria-busy="true"
            className="flex flex-col gap-1"
          >
            <span className="text-xs text-zinc-500">Claude</span>
            <p className="max-w-prose rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900">
              {streaming.text === '' ? 'Reading your figures…' : streaming.text}
            </p>
            <Reads reads={streaming.reads} />
          </div>
        )}
      </div>

      {failure !== null && failure.status !== SWITCHED_OFF && (
        <p role="alert" className="text-sm text-red-700">
          The assistant could not answer: {failure.message}
        </p>
      )}

      {isSwitchedOff ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The assistant is switched off — no API key is configured. Every figure
          on this screen carries on working without it.
        </p>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-2">
          <label
            htmlFor={questionId}
            className="text-xs font-medium text-zinc-600"
          >
            Ask about your money
          </label>
          <textarea
            id={questionId}
            rows={2}
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
            }}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <div>
            <Button type="submit" variant="primary" disabled={ask.isPending}>
              Ask
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function Line({
  entry,
  onApplied,
  onDismiss,
}: {
  entry: TranscriptEntry;
  onApplied: (proposalId: string) => void;
  onDismiss: (proposalId: string) => void;
}) {
  if (entry.kind === 'question') {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-zinc-500">You</span>
        <span className="max-w-prose rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-50">
          {entry.text}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-zinc-500">Claude</span>
      <p className="max-w-prose rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900">
        {entry.text}
      </p>

      {/* A refusal and a read limit are things the answer says about itself,
          not failures the panel has to dress as errors. */}
      {entry.wasRefused && (
        <p className="text-xs text-zinc-500">
          The assistant declined to answer that one.
        </p>
      )}
      {entry.hitReadLimit && (
        <p className="text-xs text-zinc-500">
          It stopped reading before it ran out of the app to read, so this
          answer covers only what it had.
        </p>
      )}

      <Reads reads={entry.reads} />

      {entry.proposals.map((offered) => (
        <ProposalCard
          key={offered.proposal.id}
          offered={offered}
          onApplied={onApplied}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

/** UC-8.2 — what the answer was read from, named so it can be checked. */
function Reads({ reads }: { reads: readonly AssistantReadResponse[] }) {
  if (reads.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {reads.map((read, index) => (
        <li key={index} className="flex items-center gap-1">
          <Badge tone={read.failure === null ? 'neutral' : 'warning'}>
            Read
          </Badge>
          <span className="font-mono text-xs text-zinc-500">{read.tool}</span>
          {read.failure !== null && (
            <span className="text-xs text-amber-700">{read.failure}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
