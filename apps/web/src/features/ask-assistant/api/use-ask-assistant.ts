import type {
  AssistantMessageRequest,
  AssistantReadResponse,
  AssistantStreamEvent,
  AssistantTurnResponse,
} from '@fin/contracts';
import { useMutation } from '@tanstack/react-query';

import { ApiError, streamEvents } from '@/shared/api';

const PATH = '/assistant/messages';

/** What the panel does with each frame as it arrives. */
export interface TurnHandlers {
  onText: (delta: string) => void;
  onRead: (read: AssistantReadResponse) => void;
  onTurn: (turn: AssistantTurnResponse) => void;
}

/**
 * UC-8.1 — one question, and the answer as it is written. The transcript
 * never travels: the server holds it and the client carries only the id it
 * was handed back.
 */
export function useAskAssistant(handlers: TurnHandlers) {
  return useMutation({
    mutationFn: async (request: AssistantMessageRequest) => {
      for await (const event of streamEvents<AssistantStreamEvent>(PATH, {
        method: 'POST',
        body: JSON.stringify(request),
      })) {
        switch (event.event) {
          case 'text':
            handlers.onText(event.data.delta);
            break;
          case 'tool':
            handlers.onRead(event.data);
            break;
          case 'turn':
            handlers.onTurn(event.data);
            break;
          case 'error':
            // The headers were already out, so what the server could only
            // tell as an event becomes the status it would have been.
            throw new ApiError(event.data.status, PATH, event.data.error);
          default: {
            const unhandled: never = event;
            throw new Error(`Unknown frame ${JSON.stringify(unhandled)}.`);
          }
        }
      }
    },
  });
}
