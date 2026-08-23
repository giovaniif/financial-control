import { Button } from '@/shared/ui';

import { withLocalDates } from '../model/record-summary.js';
import { SECTION_LABELS } from '../model/sections.js';
import type { DraftSection } from '../model/transcript.js';

interface Props {
  sections: DraftSection[];
  disabled: boolean;
  onCreate: () => void;
  error: string | undefined;
}

/**
 * The last moment before anything is written — UC-1.5. The draft is read back
 * whole, grouped the way it was asked for, because one button at the end of a
 * long conversation is not a confirmation of what the conversation understood.
 */
export function DraftReview({ sections, disabled, onCreate, error }: Props) {
  return (
    <section
      aria-label="Your draft"
      className="flex flex-col gap-4 rounded-xl border border-zinc-900 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Everything you told me</h2>
        <p className="text-sm text-zinc-600">
          Nothing has been written yet. Read it through — anything wrong can
          still be edited above, or said again. Creating applies the whole draft
          at once, and everything in it stays editable afterwards.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {sections.map(({ section, records }) => (
          <div key={section} className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
              {SECTION_LABELS[section]}
            </h3>
            <ul className="flex flex-col gap-1 text-sm text-zinc-900">
              {records.map((record) => (
                <li key={record.id ?? record.section}>
                  {withLocalDates(record.summary)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div>
        <Button variant="primary" disabled={disabled} onClick={onCreate}>
          Create everything
        </Button>
      </div>

      {error !== undefined && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
