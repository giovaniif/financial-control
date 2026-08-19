import { useLocation, useNavigate } from 'react-router';

import { useSetupState } from '@/shared/api';
import { skipSetup } from '@/shared/model';
import { Skeleton } from '@/shared/ui';

import { SetupChat } from './setup-chat.js';
import { SetupForm } from './setup-form.js';
import { SetupFrame } from './setup-frame.js';

/** The gate records where the user was sent from; nothing else sets it. */
function redirectedFrom(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return undefined;
  }
  return typeof state.from === 'string' ? state.from : undefined;
}

/**
 * UC-1.5 — first run. Deliberately outside the app shell: the sidebar leads to
 * screens that are all empty until this is finished.
 *
 * Which way it asks is decided before the user types anything. Learning that
 * the assistant is unreachable from a first turn coming back refused would
 * mean asking someone to start over in a different form.
 *
 * The frame is owned here rather than by either way of asking, so the bar
 * carrying it is one element for the whole of first run — it neither moves nor
 * is rebuilt when the conversation loads under it.
 */
export function OnboardingPage() {
  const { data, isPending } = useSetupState();
  const navigate = useNavigate();
  const location = useLocation();

  // Leaving lands on whatever the user originally asked for, not on the
  // dashboard they never chose.
  const leave = () => {
    skipSetup();
    void navigate(redirectedFrom(location.state) ?? '/', { replace: true });
  };

  const isConversation = data?.assistantAvailable === true;

  return (
    <SetupFrame onSkip={leave}>
      {isConversation ? (
        <SetupChat />
      ) : (
        // The form is a document, and a document scrolls — but inside the
        // frame, so the bar above it stays where it was put.
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto w-full max-w-3xl">
            {isPending ? <Skeleton className="h-64 w-full" /> : <SetupForm />}
          </div>
        </div>
      )}
    </SetupFrame>
  );
}
