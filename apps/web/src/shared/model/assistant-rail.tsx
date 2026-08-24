import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { AssistantRailContext } from './assistant-rail-context.js';
import { loadRailOpen, saveRailOpen } from './assistant-rail-storage.js';
import { WIDE_ENOUGH_FOR_SHELL } from './breakpoints.js';

/**
 * UC-8 — the assistant follows the user across the three screens, so whether
 * its rail is open is shell state rather than one screen's.
 *
 * Holding the question a screen wants asked here too is what replaced the
 * page reaching into the composer through a ref: the alert states the
 * question, the composer picks it up, and neither knows the other exists.
 */
export function AssistantRailProvider({ children }: { children: ReactNode }) {
  // Narrow, the rail covers the figures rather than sitting beside them, so
  // reopening it on load would open the app onto the chat instead of the
  // numbers. The preference is kept; it is only not honoured here.
  const [isOpen, setIsOpen] = useState(
    () => loadRailOpen() && window.matchMedia(WIDE_ENOUGH_FOR_SHELL).matches,
  );
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const value = useMemo(() => {
    const set = (next: boolean) => {
      setIsOpen(next);
      saveRailOpen(next);
    };

    return {
      isOpen,
      pendingQuestion,
      open: () => {
        set(true);
      },
      close: () => {
        set(false);
      },
      toggle: () => {
        set(!isOpen);
      },
      ask: (question: string) => {
        setPendingQuestion(question);
        set(true);
      },
      takePendingQuestion: () => {
        setPendingQuestion(null);
      },
    };
  }, [isOpen, pendingQuestion]);

  return <AssistantRailContext value={value}>{children}</AssistantRailContext>;
}
