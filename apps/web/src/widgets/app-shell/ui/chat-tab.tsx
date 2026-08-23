import { useAssistantRail } from '@/shared/model';

import { ASSISTANT_RAIL_ID } from '../model/rail-id.js';

/**
 * The rail folded away: one floating control on the edge the rail opens on.
 *
 * It floats rather than holding a strip of its own — a permanent bar beside
 * the nav is a second thing to account for on every screen, and the chat is
 * asked for occasionally rather than read continuously.
 */
export function ChatTab() {
  const { open, isOpen } = useAssistantRail();

  return (
    <button
      type="button"
      onClick={open}
      aria-expanded={isOpen}
      aria-controls={ASSISTANT_RAIL_ID}
      className="fixed bottom-5 left-5 z-30 flex cursor-pointer items-center gap-2 rounded-full bg-zinc-900 py-2.5 pr-4 pl-3 text-sm font-medium text-zinc-50 shadow-lg ring-1 ring-zinc-900/10 transition-colors hover:bg-zinc-700"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5 shrink-0"
      >
        <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z" />
      </svg>
      Assistente
    </button>
  );
}
