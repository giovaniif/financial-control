import { useRef, useState, type SyntheticEvent } from 'react';

interface Props {
  disabled: boolean;
  onSend: (message: string) => void;
}

/**
 * The field is the whole composer — UC-1.5. Enter sends, because an answer is
 * usually one line; Shift+Enter is there for the answer that lists four bills.
 */
export function Composer({ disabled, onSend }: Props) {
  const [answer, setAnswer] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);

  // A textarea cannot size itself to its content, so the height is measured
  // from the content every time it changes.
  const grow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = `${String(element.scrollHeight)}px`;
  };

  const send = (event: SyntheticEvent) => {
    event.preventDefault();
    const message = answer.trim();
    if (message === '' || disabled) {
      return;
    }

    setAnswer('');
    if (box.current !== null) {
      box.current.style.height = 'auto';
    }
    onSend(message);
  };

  return (
    <form onSubmit={send} className="flex flex-col gap-2">
      <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-white py-2 pr-2 pl-3.5 transition-colors focus-within:border-zinc-400">
        <textarea
          ref={box}
          rows={1}
          value={answer}
          aria-label="Your answer"
          placeholder="18k, always on the 5th"
          onChange={(event) => {
            setAnswer(event.target.value);
            grow(event.target);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              send(event);
            }
          }}
          className="max-h-48 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={disabled || answer.trim() === ''}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-zinc-900 text-zinc-50 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        Enter sends · Shift + Enter starts a new line
      </p>
    </form>
  );
}
