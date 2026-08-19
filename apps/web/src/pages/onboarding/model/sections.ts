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
  ANCHOR: 'O ciclo de pagamento',
  ACCOUNTS: 'Contas',
  SALARY: 'Salário',
  FIXED_BILLS: 'Contas fixas',
  VARIABLE_BILLS: 'Contas variáveis',
  CARDS: 'Cartões de crédito',
  BUCKETS: 'Caixinhas',
};
