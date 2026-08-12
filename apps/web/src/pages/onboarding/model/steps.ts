export const STEP_IDS = [
  'why',
  'cycle',
  'accounts',
  'cards',
  'templates',
  'buckets',
  'done',
] as const;

export type StepId = (typeof STEP_IDS)[number];

interface StepDefinition {
  id: StepId;
  /** Short enough for the indicator. */
  label: string;
  /** The step's own heading. */
  title: string;
}

/**
 * Teach-then-do: each step explains one idea and then performs the
 * configuration that idea describes, so the wizard leaves the app set up
 * rather than merely read.
 */
export const STEPS: readonly StepDefinition[] = [
  { id: 'why', label: 'Why', title: 'Why this app exists' },
  { id: 'cycle', label: 'The payday cycle', title: 'The payday cycle' },
  { id: 'accounts', label: 'Accounts', title: 'Where your money sits' },
  { id: 'cards', label: 'Cards', title: 'Credit cards and their invoices' },
  { id: 'templates', label: 'Templates', title: 'The bills that repeat' },
  { id: 'buckets', label: 'Buckets', title: 'What you are saving for' },
  { id: 'done', label: 'Done', title: 'You are set up' },
];
