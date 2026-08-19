import { useLocation, useNavigate } from 'react-router';

import { useSetupState } from '@/shared/api';
import { skipSetup } from '@/shared/model';
import { Skeleton } from '@/shared/ui';

import { RestoreBackup } from './restore-backup.js';
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
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            First run
          </p>
          <h1 className="text-2xl font-semibold">Setting up</h1>
        </div>
        <button
          type="button"
          onClick={leave}
          className="cursor-pointer text-sm text-zinc-500 underline-offset-2 hover:underline"
        >
          Skip for now
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-8">
        {isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : data?.assistantAvailable === true ? (
          <SetupChat />
        ) : (
          <SetupForm />
        )}
        {/* Restoring replaces everything, so it is only offered while there
            is nothing to lose. Profile carries the same thing with the counts
            it would overwrite spelled out. */}
        {data?.isPristine === true && <RestoreBackup />}
      </main>
    </div>
  );
}
