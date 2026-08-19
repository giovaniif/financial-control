import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { skipSetup } from '@/shared/model';
import { Button, Stepper } from '@/shared/ui';

import { STEPS } from '../model/steps.js';
import { useWizard } from '../model/use-wizard.js';

/** The gate records where the user was sent from; nothing else sets it. */
function redirectedFrom(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return undefined;
  }
  return typeof state.from === 'string' ? state.from : undefined;
}

/**
 * UC-1.5 — first run. Deliberately outside the app shell: the sidebar leads to
 * seven screens that are all empty until this is finished.
 */
export function OnboardingPage() {
  const wizard = useWizard();
  const step = STEPS[wizard.index];
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Leaving lands on whatever the user originally asked for, not on the
  // dashboard they never chose.
  const leave = () => {
    skipSetup();
    void navigate(redirectedFrom(location.state) ?? '/', { replace: true });
  };

  // Swapping the body alone would leave a screen reader announcing the
  // previous step, so the new heading takes focus.
  useEffect(() => {
    heading.current?.focus();
  }, [wizard.index]);

  if (step === undefined) {
    return null;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
            Setting up
          </p>
          <button
            type="button"
            onClick={leave}
            className="cursor-pointer text-sm text-zinc-500 underline-offset-2 hover:underline"
          >
            Skip for now
          </button>
        </div>
        <Stepper steps={STEPS} current={wizard.index} />
      </header>

      <main className="flex flex-1 flex-col gap-4">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold outline-none"
        >
          {step.title}
        </h1>
      </main>

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4">
        <Button onClick={wizard.back} disabled={wizard.isFirst}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={wizard.next}
          disabled={wizard.isLast}
        >
          Continue
        </Button>
      </footer>
    </div>
  );
}
