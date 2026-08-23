import type { AlertResponse } from '@fin/contracts';

/**
 * UC-4.7 with UC-8 — an alert is the thing most worth asking about, so the
 * screen writes the question rather than leaving the user to retype what it
 * has already told them.
 */
export function questionFor(alert: AlertResponse): string {
  return `Sobre “${alert.title}”: ${alert.body} Por que isso acontece, e o que mudaria isso?`;
}
