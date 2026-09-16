import type { CashReport } from '../budget/cash';
import type { InvestmentSummary } from '../budget/investments';
import type {
  CashSettings,
  InstallmentPlan,
  InvestmentBucket,
  Month,
  RecurringExpense,
} from '../budget/types';

/**
 * The "Carteira" side of the app: recurring expenses, instalment plans, the invested reserve and
 * the cash report. Like `BudgetRepository`, the screens only ever talk to this contract — in the
 * browser it is `HttpWalletRepository`, on the server `PostgresWalletRepository`.
 */

/** Everything the Carteira screens need, in one read. */
export interface WalletSnapshot {
  recurring: RecurringExpense[];
  installments: InstallmentPlan[];
  investments: InvestmentSummary;
  cash: {
    settings: CashSettings;
    report: CashReport;
  };
  /** The day the server used for "hoje" (America/Sao_Paulo), so both sides agree. */
  today: string;
}

/** Launching an "À vista" plan as a single expense, at creation time. */
export interface UpfrontLaunch {
  month: Month;
  date: string;
}

export interface AllocateInput {
  bucketId: string;
  /** How much money to move into the bucket, in BRL. */
  amount: number;
  /** Competence the resulting expense is written to. */
  month: Month;
  date: string;
}

export interface WalletRepository {
  getSnapshot(): Promise<WalletSnapshot>;

  saveRecurring(item: RecurringExpense): Promise<void>;
  deleteRecurring(id: string): Promise<void>;

  /** Creates or updates a plan; on creation it also charges the months that already exist. */
  saveInstallment(plan: InstallmentPlan, upfront?: UpfrontLaunch): Promise<void>;
  /** Deletes the plan and the charges that had not happened yet. */
  deleteInstallment(id: string): Promise<void>;

  setTicker(ticker: string): Promise<void>;
  /** Buys (positive) or sells (negative) quotas of the reserve. */
  tradeQuotas(delta: number): Promise<void>;
  saveBucket(bucket: InvestmentBucket): Promise<void>;
  deleteBucket(id: string): Promise<void>;
  /** Moves money into a bucket: adds the quotas and charges the bucket's envelope. */
  allocate(input: AllocateInput): Promise<void>;
  /** Asks the server for a fresh quote. */
  refreshPrice(): Promise<void>;

  saveCashSettings(settings: CashSettings): Promise<void>;
}
