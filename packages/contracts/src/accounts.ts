import type { Cents } from './money.js';

export type AccountType = 'CHECKING' | 'SAVINGS' | 'CASH';

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  balance: Cents;
}

export interface AccountsResponse {
  accounts: AccountResponse[];
  /** The sidebar's "In accounts now", summed server-side. */
  total: Cents;
}

export interface OpenAccountRequest {
  name: string;
  type: AccountType;
  balance: Cents;
}

export interface RenameAccountRequest {
  name: string;
}

export interface CorrectBalanceRequest {
  balance: Cents;
}
