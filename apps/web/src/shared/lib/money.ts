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

/**
 * The inverse of `formatBRL`, for a form: an amount typed the way it is
 * written becomes integer cents without ever passing through a float, so a
 * value entered as `1.000.000,01` is exactly 100000001 cents.
 *
 * Returns null rather than 0 for anything unreadable — a form must not turn a
 * typo into a silent zero.
 */
export function parseBRL(input: string): Cents | null {
  const cleaned = input.replace(/[R$\s.]/g, '');
  if (!/^-?\d+(,\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const negative = cleaned.startsWith('-');
  const [reais = '0', cents = ''] = cleaned.replace('-', '').split(',');
  const magnitude = Number(reais) * 100 + Number(cents.padEnd(2, '0'));

  return negative ? -magnitude : magnitude;
}

/**
 * What a money field shows as it is typed: digits fill from the right, so
 * `300000` reads back as `3.000,00`.
 *
 * The alternative is letting the user type the separators and forgiving them
 * afterwards, which is how a field ends up holding `0,003000` — text that
 * looks like a number and parses as nothing. Here every keystroke leaves the
 * field holding something {@link parseBRL} accepts.
 */
export function maskBRL(input: string): string {
  const isNegative = input.trimStart().startsWith('-');
  const digits = input
    .replace(/\D/g, '')
    .replace(/^0+(?=\d)/, '')
    .slice(0, 12);

  if (digits === '') {
    return isNegative ? '-' : '';
  }

  return `${isNegative ? '-' : ''}${formatBRL(Number(digits)).replace(/^R\$\s*/u, '')}`;
}
