import { AssistantPanel } from '@/features/ask-assistant';
import { useMediaQuery } from '@/shared/lib';
import { useAssistantRail, WIDE_ENOUGH_FOR_RAIL } from '@/shared/model';

import { ASSISTANT_RAIL_ID } from '../model/rail-id.js';

/**
 * UC-8 — the assistant as a rail of its own, beside the nav rather than
 * inside a screen. Opening it folds the nav to icons, so the content gives up
 * only the width the chat actually occupies.
 *
 * It hides rather than unmounts: collapsing is a change of width, and a
 * transcript, a half-written question or an unconfirmed proposal must not be
 * the price of making room for the figures.
 */
export function AssistantRail() {
  const { isOpen, close } = useAssistantRail();
  const isWide = useMediaQuery(WIDE_ENOUGH_FOR_RAIL);

  // Below 64rem the icon strip, 380px of chat and a readable column of
  // figures do not fit at once, so the rail covers the content instead of
  // pushing it into a column too narrow to read.
  const placement = isWide
    ? 'sticky top-0 h-screen w-[380px] shrink-0'
    : 'fixed inset-y-0 left-14 z-30 w-[min(380px,calc(100vw-3.5rem))] shadow-2xl';

  return (
    <aside
      id={ASSISTANT_RAIL_ID}
      aria-label="Assistente"
      hidden={!isOpen}
      data-layout={isWide ? 'inline' : 'overlay'}
      className={
        isOpen
          ? `flex flex-col border-r border-zinc-200 bg-zinc-50 ${placement}`
          : ''
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Claude</span>
          <span className="text-xs text-zinc-500">
            Pergunte sobre qualquer número em qualquer tela
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-expanded={isOpen}
          aria-controls={ASSISTANT_RAIL_ID}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
          >
            <path d="M14.5 6 8.5 12l6 6" />
          </svg>
          <span className="sr-only">Fechar o assistente</span>
        </button>
      </div>

      {/* The rail is a fixed width and the transcript scrolls inside it, so
          an answer arriving token by token grows the transcript and never the
          layout around it. */}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <AssistantPanel />
      </div>
    </aside>
  );
}
