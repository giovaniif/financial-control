import type { ReactNode } from 'react';

interface Props {
  /** The progress path, when there is a conversation to be part-way through. */
  progress?: ReactNode;
  onSkip: () => void;
  children: ReactNode;
}

/**
 * First run is an application, not a document: the frame is the viewport, the
 * bar below stays put, and whatever the frame holds does its own scrolling.
 * Nothing here scrolls the page — a chat whose header slides away is a page
 * with messages on it.
 */
export function SetupFrame({ progress, onSkip, children }: Props) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-zinc-900">
      <header className="flex shrink-0 items-center gap-4 border-b border-zinc-200 px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-md bg-zinc-900 font-mono text-xs font-semibold text-zinc-50"
          >
            R
          </span>
          <span className="text-sm font-semibold">Financial Control</span>
          {/* The screen still has a name; what it does not have is a title
              block. The bar carries the mark and the path, and the name is
              read where a name is read from. */}
          <h1 className="sr-only">Setting up</h1>
        </div>

        {progress !== undefined && (
          <div className="min-w-0 flex-1 overflow-x-auto">{progress}</div>
        )}

        <button
          type="button"
          onClick={onSkip}
          className="ml-auto shrink-0 cursor-pointer text-sm text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline"
        >
          Skip for now
        </button>
      </header>

      {children}
    </div>
  );
}
