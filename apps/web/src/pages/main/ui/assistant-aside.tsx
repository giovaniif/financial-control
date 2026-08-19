import type { RefObject } from 'react';

import { AssistantPanel } from '@/features/ask-assistant';
import { Button } from '@/shared/ui';

interface Props {
  isOpen: boolean;
  /** Wide enough for the chat to sit beside the figures rather than fold away. */
  isWide: boolean;
  onToggle: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
}

/**
 * UC-8 — the assistant belongs beside the figures it reads, not in a corner.
 *
 * There is only room for that on a wide window. Narrower than the layout's
 * two columns it would be a second column of its own width fighting the
 * figures for the screen, so it folds down to one control and opens on
 * demand — including when an alert hands it a question. The panel stays
 * mounted either way: a conversation that resets itself when the window is
 * resized is worse than one that has to be opened.
 */
export function AssistantAside({ isOpen, isWide, onToggle, panelRef }: Props) {
  return (
    <aside
      aria-label="Assistant"
      className="flex min-w-0 flex-col gap-2 xl:sticky xl:top-24"
    >
      {!isWide && (
        <Button aria-expanded={isOpen} onClick={onToggle}>
          {isOpen ? 'Hide Claude' : 'Ask Claude'}
        </Button>
      )}
      <div ref={panelRef} hidden={!isOpen}>
        <AssistantPanel />
      </div>
    </aside>
  );
}
