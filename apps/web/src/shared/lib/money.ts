import type { Cents } from '@fin/contracts';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * The only place money is turned into a string. Amounts arrive as integer
 * cents, matching the backend's `Money`, and are never formatted inline.
 */
export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100);
}

/** `R$ 142k` — for a projection where the exact cents are noise. */
export function formatBRLCompact(cents: Cents): string {
  const reais = Math.abs(cents) / 100;
  const sign = cents < 0 ? '-' : '';

  if (reais >= 1_000_000) {
    return `${sign}R$ ${(reais / 1_000_000).toFixed(2).replace('.', ',')}M`;
  }
  if (reais >= 1_000) {
    return `${sign}R$ ${(reais / 1_000).toFixed(1).replace('.', ',')}k`;
  }
  return brl.format(cents / 100);
}
