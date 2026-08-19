import { useLocation, useNavigate } from 'react-router';

import { useSetupState } from '@/shared/api';
import { skipSetup } from '@/shared/model';
import { Skeleton } from '@/shared/ui';

import { SetupChat } from './setup-chat.js';
import { SetupForm } from './setup-form.js';

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-10 bg-white px-6 py-14 text-zinc-900">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            First run
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Setting up
          </h1>
        </div>
        <button
          type="button"
          onClick={leave}
          className="mt-1 shrink-0 cursor-pointer text-sm text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline"
        >
          Skip for now
        </button>
      </header>

      <main className="flex flex-1 flex-col">
        {isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : data?.assistantAvailable === true ? (
          <SetupChat />
        ) : (
          <SetupForm />
        )}
      </main>
    </div>
  );
}
