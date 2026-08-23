import type { SetupSection } from '@fin/contracts';

/** The order the conversation asks in; each section depends on the last. */
export const SECTION_ORDER: readonly SetupSection[] = [
  'ANCHOR',
  'ACCOUNTS',
  'SALARY',
  'FIXED_BILLS',
  'VARIABLE_BILLS',
  'BUCKETS',
];

export const SECTION_LABELS: Record<SetupSection, string> = {
  ANCHOR: 'O ciclo de pagamento',
  ACCOUNTS: 'Contas',
  SALARY: 'Salário',
  FIXED_BILLS: 'Contas fixas',
  VARIABLE_BILLS: 'Contas variáveis',
  BUCKETS: 'Caixinhas',
};

/**
 * What an answer to each section looks like, shown in the composer while that
 * section is the one being asked about — FIN-134. The field sits directly
 * under the question, so an example answering a different one contradicts it.
 */
export const SECTION_PLACEHOLDERS: Record<SetupSection, string> = {
  ANCHOR: 'dia 5, voltando se cair num fim de semana',
  ACCOUNTS: 'Nubank 2.160, carteira 300',
  SALARY: '18 mil por mês',
  FIXED_BILLS: 'plano de saúde 320 no dia 8',
  VARIABLE_BILLS: 'energia, uns 280 no dia 15',
  BUCKETS: 'reserva de emergência, 1.500 por ciclo',
};

/** Nothing is outstanding, so nothing in particular is being asked for. */
export const NEUTRAL_PLACEHOLDER = 'Escreva sua resposta';
