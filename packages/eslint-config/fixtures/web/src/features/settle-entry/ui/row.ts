import { badge } from '../../../entities/cycle/index.js';
import { formatBRL } from '../../../shared/lib/money.js';

export const settle = (): string => `${badge(0)} ${formatBRL(0)}`;
