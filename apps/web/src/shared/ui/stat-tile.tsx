import type { Cents } from '@fin/contracts';

import { Amount } from './amount.js';

interface Props {
  label: string;
  cents: Cents;
  note: string;
  signed?: boolean;
}

/** One figure with the note that says what it is made of. */
export function StatTile({ label, cents, note, signed = false }: Props) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-200 bg-white p-4">
      <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
        {label}
      </span>
      <Amount cents={cents} signed={signed} className="text-xl font-semibold" />
      <span className="text-xs text-zinc-500">{note}</span>
    </div>
  );
}
