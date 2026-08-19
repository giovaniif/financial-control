import type { AnchorChangeRequest, SpreadsheetReading } from '@fin/contracts';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useChangeAnchor } from '@/features/configure-anchor';
import { useReadSpreadsheet } from '@/features/import-spreadsheet';
import { useSelectedCycle } from '@/features/navigate-cycle';
import { skipSetup } from '@/shared/model';
import { Button, Stepper } from '@/shared/ui';

import { STEPS, type StepId } from '../model/steps.js';
import { useImportDraft } from '../model/use-import-draft.js';
import { useWizard } from '../model/use-wizard.js';
import { AccountsStep } from './steps/accounts-step.js';
import { BucketsStep } from './steps/buckets-step.js';
import { CardsStep } from './steps/cards-step.js';
import { CycleStep } from './steps/cycle-step.js';
import { DoneStep } from './steps/done-step.js';
import { TemplatesStep } from './steps/templates-step.js';
import { WhyStep, type StartMode } from './steps/why-step.js';
import { ImportAccounts } from './steps/import/import-accounts.js';
import { ImportBuckets } from './steps/import/import-buckets.js';
import { ImportCards } from './steps/import/import-cards.js';
import { ImportFinish } from './steps/import/import-finish.js';
import { ImportTemplates } from './steps/import/import-templates.js';

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
  const [startMode, setStartMode] = useState<StartMode>();
  const [reading, setReading] = useState<SpreadsheetReading>();
  const [sheetFile, setSheetFile] = useState<File>();
  const reread = useReadSpreadsheet();
  const importing = useImportDraft();
  const changeAnchor = useChangeAnchor();
  const { selectedMonth } = useSelectedCycle();

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
  const commit: Partial<Record<StepId, () => Promise<unknown>>> =
    reading === undefined
      ? { cycle: () => changeAnchor.mutateAsync(anchor) }
      : {};

  /**
   * Why the wizard will not move on yet. Choosing to start from a file and
   * then walking past it lands the user in the from-scratch flow having been
   * told their data would be imported.
   */
  const blockedReason = (): string | undefined => {
    if (wizard.stepId !== 'why') {
      return undefined;
    }
    if (startMode === 'spreadsheet' && reading === undefined) {
      return 'Choose your spreadsheet to go on.';
    }
    if (startMode === 'backup') {
      return 'Restore the backup to go on, or pick another way to start.';
    }
    return undefined;
  };

  const blocked = blockedReason();

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
        {wizard.stepId === 'why' && (
          <WhyStep
            mode={startMode}
            onChooseMode={setStartMode}
            reading={reading}
            onRead={(read, file) => {
              setReading(read);
              setSheetFile(file);
            }}
            isRereading={reread.isPending}
            onCorrectYear={(firstColumnYear) => {
              if (sheetFile === undefined) {
                return;
              }
              reread.mutate(
                { file: sheetFile, firstColumnYear },
                { onSuccess: setReading },
              );
            }}
            onRestored={wizard.toEnd}
          />
        )}
        {wizard.stepId === 'cycle' && (
          <CycleStep anchor={anchor} onChange={setAnchor} />
        )}
        {wizard.stepId === 'accounts' &&
          (reading === undefined ? (
            <AccountsStep />
          ) : (
            <ImportAccounts {...importing} />
          ))}
        {wizard.stepId === 'cards' &&
          (reading === undefined ? (
            <CardsStep />
          ) : (
            <ImportCards reading={reading} {...importing} />
          ))}
        {wizard.stepId === 'templates' &&
          (reading === undefined ? (
            <TemplatesStep currentMonth={selectedMonth ?? ''} />
          ) : (
            <ImportTemplates reading={reading} {...importing} />
          ))}
        {wizard.stepId === 'buckets' &&
          (reading === undefined ? (
            <BucketsStep />
          ) : (
            <ImportBuckets reading={reading} {...importing} />
          ))}
        {wizard.stepId === 'done' &&
          (reading === undefined ? (
            <DoneStep />
          ) : (
            <ImportFinish
              reading={reading}
              draft={importing.draft}
              anchor={anchor}
            />
          ))}
      </main>

      <footer className="flex items-center justify-between border-t border-zinc-200 pt-4">
        <Button onClick={wizard.back} disabled={wizard.isFirst}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {blocked !== undefined && (
            <p className="text-xs text-zinc-500">{blocked}</p>
          )}
          <Button
            variant="primary"
            onClick={advance}
            disabled={
              wizard.isLast || changeAnchor.isPending || blocked !== undefined
            }
          >
            Continue
          </Button>
        </div>
      </footer>
    </div>
  );
}
