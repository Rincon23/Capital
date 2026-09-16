import type { BudgetSettings, Expense, Income, Month, MonthData } from '../budget/types';
import { NotAuthenticatedError, type BackupPayload, type BudgetRepository } from './repository';

/** Dispatched on `window` when the API says the session is gone; AuthProvider sends the user to /login. */
export const UNAUTHENTICATED_EVENT = 'capital:unauthenticated';

/** A failed API call. `message` is user-facing (pt-BR), straight from the server when it sent one. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

const seg = encodeURIComponent;

/**
 * Browser-side BudgetRepository: every call goes to the app's own API (/api/v1, same origin,
 * session cookie), which runs the Postgres repository on the server for the signed-in user.
 */
export class HttpBudgetRepository implements BudgetRepository {
  constructor(private readonly baseUrl = '/api/v1') {}

  getSettings(): Promise<BudgetSettings> {
    return this.request('GET', '/settings');
  }

  saveSettings(settings: BudgetSettings): Promise<void> {
    return this.request('PUT', '/settings', settings);
  }

  completeOnboarding(): Promise<void> {
    return this.request('POST', '/settings/onboarding');
  }

  listMonths(): Promise<Month[]> {
    return this.request('GET', '/months');
  }

  async getMonth(month: Month): Promise<MonthData | undefined> {
    try {
      return await this.request<MonthData>('GET', `/months/${seg(month)}`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'MONTH_NOT_FOUND') return undefined;
      throw err;
    }
  }

  peekMonth(month: Month): Promise<MonthData> {
    return this.request('GET', `/months/${seg(month)}/peek`);
  }

  ensureMonth(month: Month): Promise<MonthData> {
    return this.request('POST', `/months/${seg(month)}/ensure`);
  }

  saveIncome(month: Month, income: Income): Promise<void> {
    return this.request('PUT', `/months/${seg(month)}/incomes/${seg(income.id)}`, income);
  }

  deleteIncome(month: Month, incomeId: string): Promise<void> {
    return this.request('DELETE', `/months/${seg(month)}/incomes/${seg(incomeId)}`);
  }

  saveExpense(month: Month, expense: Expense): Promise<void> {
    return this.request('PUT', `/months/${seg(month)}/expenses/${seg(expense.id)}`, expense);
  }

  deleteExpense(month: Month, expenseId: string): Promise<void> {
    return this.request('DELETE', `/months/${seg(month)}/expenses/${seg(expenseId)}`);
  }

  closeMonth(month: Month, openNext = false): Promise<void> {
    return this.request('POST', `/months/${seg(month)}/close`, { openNext });
  }

  reopenMonth(month: Month): Promise<void> {
    return this.request('POST', `/months/${seg(month)}/reopen`);
  }

  deleteMonth(month: Month): Promise<void> {
    return this.request('DELETE', `/months/${seg(month)}`);
  }

  exportData(): Promise<BackupPayload> {
    return this.request('GET', '/backup');
  }

  importData(payload: BackupPayload): Promise<void> {
    return this.request('POST', '/backup', payload);
  }

  clearAll(): Promise<void> {
    return this.request('DELETE', '/data');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(
        'Sem conexão com o servidor. Verifique a internet e tente de novo.',
        0,
        'NETWORK',
      );
    }

    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) return payload as T;

    if (response.status === 401) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
      throw new NotAuthenticatedError();
    }
    const { error, code } = (payload ?? {}) as { error?: string; code?: string };
    throw new ApiRequestError(error || 'Erro ao acessar os dados.', response.status, code);
  }
}
