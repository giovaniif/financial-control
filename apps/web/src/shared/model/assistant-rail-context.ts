import { createContext } from 'react';

export interface AssistantRailContextValue {
  readonly isOpen: boolean;
  /**
   * A question a screen has handed over for the user to send or reword. It is
   * offered, never asked: the composer picks it up and takes it away again.
   */
  readonly pendingQuestion: string | null;
  readonly open: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
  readonly ask: (question: string) => void;
  readonly takePendingQuestion: () => void;
}

/**
 * Its own file so the provider module exports only components, which is what
 * React Fast Refresh needs to swap a component without losing state.
 */
export const AssistantRailContext = createContext<
  AssistantRailContextValue | undefined
>(undefined);
