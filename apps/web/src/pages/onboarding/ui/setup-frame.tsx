import type { ReactNode } from 'react';

interface Props {
  onSkip: () => void;
  children: ReactNode;
}

/**
 * First run is an application, not a document: the frame is the viewport, the
 * bar below stays put, and whatever the frame holds does its own scrolling.
 * Nothing here scrolls the page — a chat whose header slides away is a page
 * with messages on it.
 */
export function SetupFrame({ onSkip, children }: Props) {
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
          <span className="text-sm font-semibold">Controle Financeiro</span>
          {/* The screen still has a name; what it does not have is a
              title block, and no longer a step count either — a conversation
              that says "4 of 7" is a wizard wearing a chat's clothes. */}
          <h1 className="sr-only">Configurando</h1>
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="ml-auto shrink-0 cursor-pointer text-sm text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline"
        >
          Pular por agora
        </button>
      </header>

      {children}
    </div>
  );
}
