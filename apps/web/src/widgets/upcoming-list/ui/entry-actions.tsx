import type { UpcomingEntryResponse } from '@fin/contracts';

import { OverrideEntry } from '@/features/override-entry';
import { SettleWithAmount, SkipEntry } from '@/features/settle-entry';
import { Disclosure } from '@/shared/ui';

/**
 * Everything else that can be done to one entry.
 *
 * A menu rather than a button that opens a form: `⋯` reads as "show me what
 * I can do here", and jumping straight into a dialog answered a question
 * nobody had asked yet.
 *
 * The two amount-changing items are deliberately worded apart. Settling
 * records what actually moved; overriding changes what the cycle expects
 * before anything is paid, and leaves the recurring bill alone (UC-3.7).
 */
export function EntryActions({ entry }: { entry: UpcomingEntryResponse }) {
  return (
    <Disclosure label={`Ações de ${entry.description}`}>
      <>
        <SettleWithAmount
          month={entry.cycleMonth}
          entryId={entry.id}
          planned={entry.amount}
        />
        <OverrideEntry
          month={entry.cycleMonth}
          entryId={entry.id}
          description={entry.description}
          planned={entry.amount}
        />
        <div className="mt-1 border-t border-zinc-100 pt-1">
          <SkipEntry
            month={entry.cycleMonth}
            entryId={entry.id}
            description={entry.description}
          />
        </div>
      </>
    </Disclosure>
  );
}
