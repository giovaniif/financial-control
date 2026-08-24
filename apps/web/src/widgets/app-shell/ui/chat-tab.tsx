import { useAssistantRail } from '@/shared/model';

import { ASSISTANT_RAIL_ID } from '../model/rail-id.js';

/**
 * The rail folded away: one floating control on the edge the rail opens on.
 *
 * It floats rather than holding a strip of its own — a permanent bar beside
 * the nav is a second thing to account for on every screen, and the chat is
 * asked for occasionally rather than read continuously.
 *
 * On a phone it is an icon in the bottom-right, where a thumb already is and
 * where nothing else on the screen wants to be. The label goes: it named a
 * button whose icon says the same thing, and the width it cost sat over the
 * figures. `aria-label` carries the name either way, so what a screen reader
 * hears does not change with the viewport.
 */
export function ChatTab() {
  const { open, isOpen } = useAssistantRail();

  return (
    <button
      type="button"
      onClick={open}
      aria-expanded={isOpen}
      aria-controls={ASSISTANT_RAIL_ID}
      aria-label="Assistente"
      className="fixed right-5 bottom-5 z-30 flex size-14 cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-900 text-sm font-medium text-zinc-50 shadow-lg ring-1 ring-zinc-900/10 transition-colors hover:bg-zinc-700 lg:right-auto lg:left-5 lg:size-auto lg:py-2.5 lg:pr-4 lg:pl-3"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6 shrink-0 lg:size-5"
      >
        <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z" />
      </svg>
      <span className="hidden lg:inline">Assistente</span>
    </button>
  );
}
