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
