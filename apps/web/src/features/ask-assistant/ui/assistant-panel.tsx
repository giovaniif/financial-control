import type { AssistantReadResponse } from '@fin/contracts';
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';

import { ApiError, useSetupState } from '@/shared/api';
import { useAssistantRail } from '@/shared/model';
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
  const { pendingQuestion, takePendingQuestion } = useAssistantRail();
  const composer = useRef<HTMLTextAreaElement>(null);
  const [conversation, setConversation] =
    useState<Conversation>(loadConversation);
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

  /**
   * A question raised elsewhere in the app — an alert on Main — arrives as a
   * draft, exactly as if it had been typed: offered, never sent on the user's
   * behalf, and editable before it goes.
   *
   * The draft lives in the textarea rather than in state because the app
   * writes into it as well as the user does, which is what an effect is for:
   * pushing what React knows into something that is not React.
   */
  useEffect(() => {
    const box = composer.current;
    if (pendingQuestion === null || box === null) {
      return;
    }

    box.value = pendingQuestion;
    box.focus();
    takePendingQuestion();
  }, [pendingQuestion, takePendingQuestion]);

  const send = (event: SyntheticEvent) => {
    event.preventDefault();
    const box = composer.current;
    const message = box?.value.trim() ?? '';
    if (message === '' || ask.isPending) {
      return;
    }

    const { conversationId } = conversation;
    setConversation((current) => ({
      ...current,
      entries: [...current.entries, { kind: 'question', text: message }],
    }));
    if (box !== null) {
      box.value = '';
    }
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
    <Card className="flex h-full min-h-0 flex-col gap-3">
      <CardTitle>Perguntar</CardTitle>
      <p className="text-sm text-zinc-600">
        Pergunte sobre qualquer número, ou diga o que mudou. Toda mudança é
        proposta antes — nada é escrito até você confirmar.
      </p>

      {/* The transcript scrolls inside the rail so the composer below it is
          always reachable, and streaming text never moves the layout. */}
      <div
        role="log"
        aria-label="Conversa com o assistente"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
      >
        {conversation.entries.length === 0 && streaming === null && (
          <p className="text-sm text-zinc-500">
            Nada perguntado ainda. Tente{' '}
            <em>&ldquo;por que setembro está mais baixo que agosto?&rdquo;</em>
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
              {streaming.text === '' ? 'Lendo seus números…' : streaming.text}
            </p>
            <Reads reads={streaming.reads} />
          </div>
        )}
      </div>

      {failure !== null && failure.status !== SWITCHED_OFF && (
        <p role="alert" className="text-sm text-red-700">
          O assistente não conseguiu responder: {failure.message}
        </p>
      )}

      {isSwitchedOff ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          O assistente está desligado — nenhuma chave de API está configurada.
          Todos os números desta tela continuam funcionando sem ele.
        </p>
      ) : (
        <form onSubmit={send} className="flex shrink-0 flex-col gap-2">
          <label
            htmlFor={questionId}
            className="text-xs font-medium text-zinc-600"
          >
            Pergunte sobre o seu dinheiro
          </label>
          <textarea
            id={questionId}
            ref={composer}
            rows={2}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <div>
            <Button type="submit" variant="primary" disabled={ask.isPending}>
              Perguntar
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
        <span className="text-xs text-zinc-500">Você</span>
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
          O assistente recusou responder a essa pergunta.
        </p>
      )}
      {entry.hitReadLimit && (
        <p className="text-xs text-zinc-500">
          Ele parou de ler antes de esgotar o que havia para ler no app, então
          esta resposta cobre só o que conseguiu ver.
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
            Leitura
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
