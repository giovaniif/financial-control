import type { AssistantReadResponse } from '@fin/contracts';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';

import { ApiError, useSetupState } from '@/shared/api';
import { useAssistantRail } from '@/shared/model';
import { Badge } from '@/shared/ui';

import { useAskAssistant } from '../api/use-ask-assistant.js';
import { explainAskFailure } from '../model/ask-failure.js';
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
  const [hasText, setHasText] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const box = transcript.current;
    if (box !== null) {
      box.scrollTop = box.scrollHeight;
    }
  }, [conversation, streaming]);

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
    setHasText(box.value.trim() !== '');
    grow(box);
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
      setHasText(false);
      grow(box);
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

  /**
   * Enter sends and Shift+Enter breaks the line — the convention every chat
   * shares, and what keeps a conversation on the keyboard.
   */
  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      send(event);
    }
  };

  const failure = ask.error instanceof ApiError ? ask.error : null;
  const isSwitchedOff =
    setup.data?.assistantAvailable === false ||
    failure?.status === SWITCHED_OFF;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The transcript scrolls inside the rail so the composer below it is
          always reachable, and streaming text never moves the layout. */}
      <div
        ref={transcript}
        role="log"
        aria-label="Conversa com o assistente"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-1 py-2"
      >
        {conversation.entries.length === 0 && streaming === null && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-sm font-medium text-zinc-700">
              Nada perguntado ainda
            </p>
            <p className="text-sm text-zinc-500">
              Pergunte sobre qualquer número, ou diga o que mudou. Toda mudança
              é proposta antes — nada é escrito até você confirmar.
            </p>
            <p className="text-sm text-zinc-400">
              <em>
                &ldquo;por que setembro está mais baixo que agosto?&rdquo;
              </em>
            </p>
          </div>
        )}

        <ol className="flex flex-col gap-6">
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
            className="flex flex-col gap-2"
          >
            <Speaker name="Claude" />
            {streaming.text === '' ? (
              <Thinking />
            ) : (
              <p className="text-sm whitespace-pre-wrap text-zinc-900">
                {streaming.text}
              </p>
            )}
            <Reads reads={streaming.reads} />
          </div>
        )}
      </div>

      {failure !== null && failure.status !== SWITCHED_OFF && (
        <p role="alert" className="px-1 pb-2 text-sm text-red-700">
          {explainAskFailure(failure)}
        </p>
      )}

      {isSwitchedOff ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          O assistente está desligado — nenhuma chave de API está configurada.
          Todos os números desta tela continuam funcionando sem ele.
        </p>
      ) : (
        <form
          onSubmit={send}
          className="shrink-0 pt-2 pb-[env(safe-area-inset-bottom)]"
        >
          <label htmlFor={questionId} className="sr-only">
            Pergunte sobre o seu dinheiro
          </label>
          {/* One field and its send, framed as a single control: the border
              belongs to the pair, so the composer reads as somewhere to talk
              rather than as a form field with a button after it. */}
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-2 shadow-sm focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-900/5">
            <textarea
              id={questionId}
              ref={composer}
              rows={1}
              placeholder="Pergunte sobre o seu dinheiro"
              onChange={(event) => {
                setHasText(event.target.value.trim() !== '');
                grow(event.target);
              }}
              onKeyDown={sendOnEnter}
              className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!hasText || ask.isPending}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-900 text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
              <span className="sr-only">Perguntar</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * The box grows with what is typed rather than scrolling inside two fixed
 * rows, up to the cap the class sets — height has to be cleared first or
 * `scrollHeight` only ever reports the height it already has.
 */
function grow(box: HTMLTextAreaElement) {
  box.style.height = 'auto';
  box.style.height = `${String(box.scrollHeight)}px`;
}

/** Who is speaking, above what they said. */
function Speaker({ name }: { name: string }) {
  return (
    <span className="text-xs font-medium tracking-wide text-zinc-500">
      {name}
    </span>
  );
}

/** The wait before the first token, as something moving rather than a word. */
function Thinking() {
  return (
    <span className="flex items-center gap-1 py-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-zinc-400"
          style={{ animationDelay: `${String(delay)}ms` }}
        />
      ))}
      <span className="sr-only">Lendo seus números…</span>
    </span>
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
  // The question is a bubble and the answer is not: one side of a chat being
  // quoted back and the other simply written is what makes a long transcript
  // scannable.
  if (entry.kind === 'question') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-3.5 py-2 text-sm whitespace-pre-wrap text-zinc-50">
          {entry.text}
        </p>
        <span className="sr-only">Você</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Speaker name="Claude" />
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-900">
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
