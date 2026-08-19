/**
 * The only place a share is turned into a string. Percentages are exact in the
 * domain — basis points, never a float — so the rounding decision belongs here
 * rather than at each of the dozen places a rule or a yield is shown.
 */
const loose = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatPercent(value: number, decimals?: number): string {
  if (decimals === undefined) {
    return `${loose.format(value)}%`;
  }

  const fixed = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${fixed.format(value)}%`;
}
