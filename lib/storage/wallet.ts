import type { CardBill } from '../budget/cards';
import type { AdvanceInput } from '../budget/installments';
import type { CashReport } from '../budget/cash';
import type { InvestmentSummary } from '../budget/investments';
import type {
  CardSettings,
  CashSettings,
  CreditCard,
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
  /** The registered credit cards, in the order they were created. */
  cards: CreditCard[];
  /** Every bill worth showing, already computed (see `cardBills`). */
  bills: CardBill[];
  /** The competences this user already closed: nothing can be written into them. */
  closedMonths: Month[];
  cardSettings: CardSettings;
  investments: InvestmentSummary;
  cash: {
    settings: CashSettings;
    report: CashReport;
  };
  /** The day the server used for "hoje" (America/Sao_Paulo), so both sides agree. */
  today: string;
}

/** One bill: a card and the competence it covers (`UNASSIGNED_CARD_ID` for "Não informado"). */
export interface BillRef {
  cardId: string;
  month: Month;
}

export interface AllocateInput {
  bucketId: string;
  /** How much money to move, in BRL. Always positive; `direction` says which way. */
  amount: number;
  /** 'in' guarda dinheiro na categoria, 'out' retira. Absent means 'in' (older clients). */
  direction?: 'in' | 'out';
  /** Competence the resulting expense is written to. */
  month: Month;
  date: string;
}

/** "Adiantar parcelas": how many of the last charges were paid early, and what it cost. */
export interface AdvanceInstallmentInput extends AdvanceInput {
  /** Competence the payment is written to. */
  month: Month;
}

export interface WalletRepository {
  getSnapshot(): Promise<WalletSnapshot>;

  saveRecurring(item: RecurringExpense): Promise<void>;
  deleteRecurring(id: string): Promise<void>;

  /** Creates or updates a plan, rebuilding every expense line it owns (see the server's version). */
  saveInstallment(plan: InstallmentPlan): Promise<void>;
  /** Deletes the plan and every expense line it created. */
  deleteInstallment(id: string): Promise<void>;
  /** "Adiantar parcelas": shortens the plan and records what was actually paid. */
  advanceInstallment(id: string, input: AdvanceInstallmentInput): Promise<void>;

  saveCard(card: CreditCard): Promise<void>;
  /** Deletes the card; its purchases stay, untied (they join the "Não informado" bill). */
  deleteCard(id: string): Promise<void>;
  /** "Fatura paga": the only thing that takes a bill out of the debt. */
  payBill(input: BillRef): Promise<void>;
  /** Undoes it, when the button was tapped by mistake. */
  unpayBill(input: BillRef): Promise<void>;
  saveCardSettings(settings: CardSettings): Promise<void>;

  setTicker(ticker: string): Promise<void>;
  /** Buys (positive) or sells (negative) quotas of the reserve. */
  tradeQuotas(delta: number): Promise<void>;
  saveBucket(bucket: InvestmentBucket): Promise<void>;
  deleteBucket(id: string): Promise<void>;
  /** Moves money in or out of a bucket: the quotas follow, and so does the bucket's envelope. */
  allocate(input: AllocateInput): Promise<void>;
  /** Asks the server for a fresh quote. */
  refreshPrice(): Promise<void>;

  saveCashSettings(settings: CashSettings): Promise<void>;
}
