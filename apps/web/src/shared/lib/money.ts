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
