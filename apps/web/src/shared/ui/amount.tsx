import type { Cents } from '@fin/contracts';

import { formatBRL, formatBRLCompact } from '../lib/money.js';

interface Props {
  cents: Cents;
  /** Colours money out red and money in green. Off for a neutral total. */
  signed?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Every amount on screen. Monospace so columns of figures line up, and one
 * consistent treatment of sign and colour across every screen.
 */
export function Amount({
  cents,
  signed = false,
  compact = false,
  className = '',
}: Props) {
  const tone = !signed
    ? 'text-zinc-900'
    : cents < 0
      ? 'text-red-700'
      : cents > 0
        ? 'text-green-700'
        : 'text-zinc-500';

  return (
    <span className={`font-mono tabular-nums ${tone} ${className}`}>
      {compact ? formatBRLCompact(cents) : formatBRL(cents)}
    </span>
  );
}
