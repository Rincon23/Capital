import type { BankAlertSettings, SalaryCandidate } from '../banks/alerts';
import type { BankReview } from '../banks/review';
import type { Expense, Income, InstallmentPlan, Month } from '../budget/types';

/** One decision about one line of "Confira os gastos" (see app/api/v1/banks/review). */
export type BankReviewAction =
  | { action: 'expense'; transactionIds: string[]; month: Month; expense: Expense }
  | { action: 'plan'; transactionIds: string[]; plan: InstallmentPlan }
  | { action: 'income'; transactionIds: string[]; month: Month; income: Income }
  | { action: 'linked'; transactionIds: string[]; month: Month; entryId: string }
  | { action: 'reimbursed'; transactionIds: string[]; month: Month; expenseId: string }
  | { action: 'ignore'; transactionIds: string[] }
  | { action: 'bill'; transactionIds: string[] };
import type { BankReserve, BanksOverview } from '../banks/types';

export interface BankAlertsView {
  settings: BankAlertSettings;
  candidates: SalaryCandidate[];
}

/** What the gear sends: the switches, the minimum and which credits are the salary. */
export type BankAlertChoices = Omit<BankAlertSettings, 'salaries'> & { salaryTransactionIds: string[] };
import { apiRequest, seg } from './apiClient';

export interface BanksOverviewResult extends BanksOverview {
  /** Banks whose authorization was never finished and that were taken out on this read. */
  givenUp: number;
}

/** Like `BudgetRepository`: the Open Finance screen only talks to this contract. */
export interface BanksRepository {
  getOverview(): Promise<BanksOverviewResult>;
  saveKey(clientId: string, clientSecret: string): Promise<void>;
  /** Creates the connection and answers where the person authorizes it (the screen goes there). */
  connect(): Promise<{ authorizeUrl: string }>;
  /** Reads what Pluggy has right away; answers the banks that brought something new. */
  sync(): Promise<{ changed: string[] }>;
  rename(itemId: string, name: string): Promise<void>;
  remove(itemId: string): Promise<void>;
  getAlerts(): Promise<BankAlertsView>;
  saveAlerts(choices: BankAlertChoices): Promise<BankAlertsView>;
  /** "Confira os gastos": what arrived and is still to review. */
  getReview(): Promise<BankReview>;
  /** One decision about one line; answers the list again. */
  review(action: BankReviewAction): Promise<BankReview>;
  /** Ties a bank card to a Capital card (null: "não informado"). */
  linkCard(accountId: string, cardId: string | null): Promise<void>;
  /** What can feed the Reserva and what is marked. */
  getReserve(): Promise<BankReserve>;
  /** Marks what feeds the Reserva (both empty: back to typing it). */
  setReserve(accounts: string[], investments: string[]): Promise<BankReserve>;
  disconnect(): Promise<void>;
}

export class HttpBanksRepository implements BanksRepository {
  getOverview(): Promise<BanksOverviewResult> {
    return apiRequest('GET', '/banks');
  }

  saveKey(clientId: string, clientSecret: string): Promise<void> {
    return apiRequest('PUT', '/banks/key', { clientId, clientSecret });
  }

  connect(): Promise<{ authorizeUrl: string }> {
    return apiRequest('POST', '/banks/connections');
  }

  sync(): Promise<{ changed: string[] }> {
    return apiRequest('POST', '/banks/sync');
  }

  rename(itemId: string, name: string): Promise<void> {
    return apiRequest('PATCH', `/banks/connections/${seg(itemId)}`, { name });
  }

  remove(itemId: string): Promise<void> {
    return apiRequest('DELETE', `/banks/connections/${seg(itemId)}`);
  }

  getAlerts(): Promise<BankAlertsView> {
    return apiRequest('GET', '/banks/alerts');
  }

  saveAlerts(choices: BankAlertChoices): Promise<BankAlertsView> {
    return apiRequest('PUT', '/banks/alerts', choices);
  }

  getReview(): Promise<BankReview> {
    return apiRequest('GET', '/banks/review');
  }

  review(action: BankReviewAction): Promise<BankReview> {
    return apiRequest('POST', '/banks/review', action);
  }

  linkCard(accountId: string, cardId: string | null): Promise<void> {
    return apiRequest('PUT', `/banks/cards/${seg(accountId)}`, { cardId });
  }

  getReserve(): Promise<BankReserve> {
    return apiRequest('GET', '/banks/reserve');
  }

  setReserve(accounts: string[], investments: string[]): Promise<BankReserve> {
    return apiRequest('PUT', '/banks/reserve', { accounts, investments });
  }

  disconnect(): Promise<void> {
    return apiRequest('DELETE', '/banks');
  }
}
