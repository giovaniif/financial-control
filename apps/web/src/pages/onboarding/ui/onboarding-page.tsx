import type { AnchorChangeRequest } from '@fin/contracts';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useChangeAnchor } from '@/features/configure-anchor';
import { skipSetup } from '@/shared/model';
import { Button, Stepper } from '@/shared/ui';

import { STEPS, type StepId } from '../model/steps.js';
import { useWizard } from '../model/use-wizard.js';
import { AccountsStep } from './steps/accounts-step.js';
import { CycleStep } from './steps/cycle-step.js';
import { WhyStep } from './steps/why-step.js';

/** Salary on the 5th, moving back off a closed bank — the app's default. */
const DEFAULT_ANCHOR: AnchorChangeRequest = {
  anchorDay: 5,
  shiftPolicy: 'PRECEDING',
};

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
  const [anchor, setAnchor] = useState(DEFAULT_ANCHOR);
  const changeAnchor = useChangeAnchor();

  // Leaving lands on whatever the user originally asked for, not on the
  // dashboard they never chose.
  const leave = () => {
    skipSetup();
    void navigate(redirectedFrom(location.state) ?? '/', { replace: true });
  };

  /**
   * Each step commits its own configuration before the wizard moves on, which
   * is what makes this a setup rather than a tour. A step that writes nothing
   * simply advances.
   */
  const commit: Partial<Record<StepId, () => Promise<unknown>>> = {
    cycle: () => changeAnchor.mutateAsync(anchor),
  };

  const advance = () => {
    const write = commit[wizard.stepId];
    if (write === undefined) {
      wizard.next();
      return;
    }
    void write().then(wizard.next);
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
        {wizard.stepId === 'why' && <WhyStep />}
        {wizard.stepId === 'cycle' && (
          <CycleStep anchor={anchor} onChange={setAnchor} />
        )}
        {wizard.stepId === 'accounts' && <AccountsStep />}
      </main>

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4">
        <Button onClick={wizard.back} disabled={wizard.isFirst}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={advance}
          disabled={wizard.isLast || changeAnchor.isPending}
        >
          Continue
        </Button>
      </footer>
    </div>
  );
}
