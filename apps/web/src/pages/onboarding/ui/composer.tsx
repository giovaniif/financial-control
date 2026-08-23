import { useEffect, type RefObject, type SyntheticEvent } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onSend: (message: string) => void;
  /** Held above so an example answer can fill the field and focus it. */
  ref: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The field is the whole composer — UC-1.5. Enter sends, because an answer is
 * usually one line; Shift+Enter is there for the answer that lists four bills.
 */
export function Composer({ value, onChange, disabled, onSend, ref }: Props) {
  // A textarea cannot size itself to its content, and the content arrives from
  // the user and from an example answer alike, so the height is measured from
  // whatever the field now holds rather than from a keystroke.
  useEffect(() => {
    const box = ref.current;
    if (box === null) {
      return;
    }

    box.style.height = 'auto';
    box.style.height = `${String(box.scrollHeight)}px`;
  }, [value, ref]);

  const send = (event: SyntheticEvent) => {
    event.preventDefault();
    const message = value.trim();
    if (message === '' || disabled) {
      return;
    }

    onChange('');
    onSend(message);
    // The next question is already coming, so the answer to it is typed
    // where the last one was typed.
    ref.current?.focus();
  };

  return (
    <form onSubmit={send} className="flex flex-col gap-2">
      <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-white py-2 pr-2 pl-3.5 shadow-sm transition-colors focus-within:border-zinc-400">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          aria-label="Your answer"
          placeholder="18k, always on the 5th"
          onChange={(event) => {
            onChange(event.target.value);
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
          disabled={disabled || value.trim() === ''}
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
