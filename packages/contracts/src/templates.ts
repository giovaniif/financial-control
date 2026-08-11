import type { Cents } from './money.js';

export type Direction = 'IN' | 'OUT';
export type TemplateStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';

/** Whether a change applies to one cycle or to every cycle from here on. */
export type EditScope = 'THIS_CYCLE_ONLY' | 'THIS_AND_FUTURE';

export interface ValueScheduleStepResponse {
  /** `YYYY-MM`, the cycle this amount starts applying from. */
  fromMonth: string;
  amount: Cents;
}

export interface TemplateResponse {
  id: string;
  name: string;
  direction: Direction;
  dueDayOfMonth: number;
  amount: Cents;
  status: TemplateStatus;
  isEstimate: boolean;
  startMonth: string;
  endMonth: string | null;
  valueSchedule: ValueScheduleStepResponse[];
  nextOccurrenceMonth: string | null;
}

/** The four figures above the template list. */
export interface TemplateSummaryResponse {
  fixedCommitment: Cents;
  activeOutcomeCount: number;
  fixedIncome: Cents;
  unconfirmedEstimates: Cents;
  endingWithinTwelve: string[];
}

export interface TemplatesResponse {
  templates: TemplateResponse[];
  summary: TemplateSummaryResponse;
}

export interface CreateTemplateRequest {
  name: string;
  direction: Direction;
  dueDayOfMonth: number;
  amount: Cents;
  startMonth?: string;
  endMonth?: string;
  isEstimate?: boolean;
}

export interface ChangeTemplateAmountRequest {
  fromMonth: string;
  amount: Cents;
  scope: EditScope;
}
