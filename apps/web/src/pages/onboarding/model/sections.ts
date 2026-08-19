import type { SetupSection } from '@fin/contracts';

/** The order the conversation asks in; each section depends on the last. */
export const SECTION_ORDER: readonly SetupSection[] = [
  'ANCHOR',
  'ACCOUNTS',
  'SALARY',
  'FIXED_BILLS',
  'VARIABLE_BILLS',
  'CARDS',
  'BUCKETS',
];

export const SECTION_LABELS: Record<SetupSection, string> = {
  ANCHOR: 'The payday cycle',
  ACCOUNTS: 'Accounts',
  SALARY: 'Salary',
  FIXED_BILLS: 'Fixed bills',
  VARIABLE_BILLS: 'Variable bills',
  CARDS: 'Credit cards',
  BUCKETS: 'Savings buckets',
};

/** `Section 6 of 7 — Credit cards`: the draft's own progress is the indicator. */
export function describeProgress(section: SetupSection): string {
  const position = SECTION_ORDER.indexOf(section) + 1;

  return `Section ${String(position)} of ${String(SECTION_ORDER.length)} — ${SECTION_LABELS[section]}`;
}
