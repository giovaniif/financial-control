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
      aria-label="Seu rascunho"
      className="flex flex-col gap-4 rounded-xl border border-zinc-900 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Tudo o que você me contou</h2>
        <p className="text-sm text-zinc-600">
          Nada foi gravado ainda. Confira tudo — o que estiver errado ainda pode
          ser editado acima, ou dito de novo. Criar aplica o rascunho inteiro de
          uma vez, e tudo nele continua editável depois.
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
          Criar tudo
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
