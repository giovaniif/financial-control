import { formatBRL } from '../lib/money.js';

export const amountLabel = (cents: number): string => formatBRL(cents);
