import { AssistantPanel } from '@/features/ask-assistant';
import { useMediaQuery } from '@/shared/lib';
import { useAssistantRail, WIDE_ENOUGH_FOR_SHELL } from '@/shared/model';

import { ASSISTANT_RAIL_ID } from '../model/rail-id.js';
import { EASE_SHEET, MOTION_MS } from '../model/motion.js';

/**
 * UC-8 — the assistant as a rail of its own, beside the nav rather than
 * inside a screen. Opening it folds the nav to icons, so the content gives up
 * only the width the chat actually occupies.
 *
 * It hides rather than unmounts: collapsing is a change of width, and a
 * transcript, a half-written question or an unconfirmed proposal must not be
 * the price of making room for the figures.
 *
 * `visibility` is what hides it, transitioned rather than switched, and that
 * is load-bearing twice over. It is discrete, so on the way in the rail
 * appears at once and on the way out it stays drawn until the width has
 * finished collapsing — nothing pops. And it keeps the rail out of the
 * accessibility tree while closed, which `width: 0` alone would not: a
 * transcript reachable by tab from behind the figures is worse than one that
 * animates badly.
 */
export function AssistantRail() {
  const { isOpen, close } = useAssistantRail();
  const isWide = useMediaQuery(WIDE_ENOUGH_FOR_SHELL);

  // Below 64rem a 380px column and a readable column of figures do not fit
  // at once, so the chat rises as a sheet over the screen instead — reaching
  // for the top of the viewport but not quite covering it, so what it is
  // being asked about stays in sight behind it.
  const placement = isWide
    ? `sticky top-0 h-screen shrink-0 overflow-hidden border-r ${
        isOpen ? 'w-[380px]' : 'w-0'
      }`
    : `fixed inset-x-0 top-16 bottom-0 z-40 rounded-t-2xl border-t shadow-2xl ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`;

  return (
    <aside
      id={ASSISTANT_RAIL_ID}
      aria-label="Assistente"
      data-layout={isWide ? 'inline' : 'sheet'}
      style={{
        visibility: isOpen ? 'visible' : 'hidden',
        transitionProperty: 'width, transform, visibility',
        transitionDuration: `${String(MOTION_MS)}ms`,
        transitionTimingFunction: EASE_SHEET,
      }}
      className={`flex flex-col border-zinc-200 bg-zinc-50 motion-reduce:transition-none ${placement}`}
    >
      {/* The chrome keeps the rail's full width while the rail itself is
          collapsing, so the contents slide out of frame rather than reflowing
          into a column too narrow to hold them. */}
      <div className="flex w-[380px] max-w-full shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-3">
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
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
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
      <div className="flex w-[380px] max-w-full min-h-0 flex-1 flex-col p-3">
        <AssistantPanel />
      </div>
    </aside>
  );
}
