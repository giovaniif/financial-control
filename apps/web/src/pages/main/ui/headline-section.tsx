import type { CyclePosition, HeadlineResponse } from '@fin/contracts';
import type { ReactNode } from 'react';

import { formatBRL } from '@/shared/lib';

/** How the cycle on screen relates to today, since it is no longer always next. */
const eyebrows: Record<CyclePosition, string> = {
  past: 'Ciclo passado',
  current: 'Este ciclo',
  next: 'Próximo ciclo',
  projected: 'Ciclo projetado',
};

interface Props {
  headline: HeadlineResponse;
  position: CyclePosition | undefined;
  /** What can be done to the cycle being described — closing it, or reopening it. */
  action?: ReactNode;
}

/** UC-4.1 — the answer as one sentence, and the three numbers qualifying it. */
export function HeadlineSection({ headline, position, action }: Props) {
  return (
    <section
      aria-label="A resposta"
      className="flex flex-col gap-4 rounded-xl bg-zinc-900 p-6 text-zinc-50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-zinc-400 uppercase">
          {position === undefined ? 'Ciclo' : eyebrows[position]}
          <span className="font-mono text-xs normal-case">
            {headline.range}
          </span>
        </div>
        {action}
      </div>

      <p className="max-w-4xl text-2xl leading-snug font-normal">
        No ciclo {headline.cycleLabel} você vai receber{' '}
        <strong className="font-mono font-semibold">
          {magnitude(headline.incoming)}
        </strong>
        , pagar{' '}
        <strong className="font-mono font-semibold text-red-300">
          {magnitude(headline.outgoing)}
        </strong>
        {', e '}
        <strong className="font-mono font-semibold text-green-300">
          {magnitude(headline.free)}
        </strong>{' '}
        fica livre depois das alocações.
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-zinc-800 pt-3 text-xs">
        <Qualifier label="Fecha com" value={headline.closing} />
        {/* Never let a guess masquerade as a fact. */}
        <Qualifier
          label="Sem as estimativas"
          value={headline.closingWithoutEstimates}
          tone="text-amber-300"
        />
      </div>
    </section>
  );
}

function Qualifier({
  label,
  value,
  note,
  tone = 'text-zinc-50',
}: {
  label: string;
  value: number | null;
  note?: string;
  tone?: string;
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono text-sm font-medium ${tone}`}>
        {value === null ? '—' : magnitude(value)}
      </span>
      {note !== undefined && <span className="text-zinc-500">{note}</span>}
    </span>
  );
}

/**
 * The headline reads as prose, so amounts appear without a leading minus —
 * "pay R$ 9.110" rather than "pay −R$ 9.110". The direction is in the verb.
 */
function magnitude(cents: number): string {
  return formatBRL(Math.abs(cents));
}
