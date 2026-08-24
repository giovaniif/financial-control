import type { ReactNode } from 'react';

type Tone = 'neutral' | 'positive' | 'warning' | 'critical' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-600',
  positive: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
};

interface Props {
  children: ReactNode;
  tone?: Tone;
}

export function Badge({ children, tone = 'neutral' }: Props) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
