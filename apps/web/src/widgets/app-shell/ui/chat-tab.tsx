import { useAssistantRail } from '@/shared/model';

import { ASSISTANT_RAIL_ID } from '../model/rail-id.js';

/** The rail folded away: one strip on the edge, and the way back into it. */
export function ChatTab() {
  const { open, isOpen } = useAssistantRail();

  return (
    <div className="sticky top-0 flex h-screen w-11 shrink-0 flex-col items-center gap-3 border-l border-zinc-200 bg-white py-4">
      <button
        type="button"
        onClick={open}
        aria-expanded={isOpen}
        aria-controls={ASSISTANT_RAIL_ID}
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
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
          <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7Z" />
        </svg>
        <span className="sr-only">Open the assistant</span>
      </button>
      <span
        aria-hidden="true"
        className="text-[10px] font-semibold tracking-widest text-zinc-400 uppercase [writing-mode:vertical-rl]"
      >
        Ask Claude
      </span>
    </div>
  );
}
