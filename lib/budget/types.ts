/**
 * Domain types for the Capital budgeting app.
 * These types have no dependency on React or on any storage technology,
 * so the same definitions serve the pure calculation layer, the storage
 * layer, and the UI.
 */
import type { NotificationCategory } from '../notifications/types';

/** Competence month, formatted "YYYY-MM" (e.g. "2026-09"). */
export type Month = string;

/**
 * Kind of expense category. 'reimbursable' ("A receber") is a card purchase made for
 * someone else who will pay it back: it lands on the card bill but consumes no envelope.
 * 'uncounted' ("Fora do orçamento") is the escape hatch: the expense is recorded and, when it
 * is a card purchase, lands on the bill, but it consumes no envelope either — which is why the
 * app marks it as "Não recomendado" wherever it is offered.
 */
export type CategoryKind = 'topic' | 'fixedCost' | 'unforeseen' | 'reimbursable' | 'uncounted';

/** The categories every account starts with (see DEFAULT_TOPICS). */
export type TopicPreset = 'diversos' | 'investimentos' | 'metas' | 'conhecimentos';

/**
 * A budget envelope ("Diversos", "Investimentos", ...). Never deleted, only archived: past months
 * keep what it had, and archived categories are never shown.
 */
export interface TopicConfig {
  id: string;
  name: string;
  /** What the category is for. Absent in older data; resolve with `topicDescription`. */
  description?: string;
  /** Set on the default categories, so "restore defaults" finds them even after a rename. */
  preset?: TopicPreset;
  /** Target percentage of income allocated to this topic, expressed as 0..1. */
  targetPct: number;
  order: number;
  archived?: boolean;
  /** Hex color (e.g. "#2a78d6") for this envelope in charts and card accents. Optional for older data. */
  color?: string;
}

/**
 * User-configurable labels for the special (non-envelope) categories. 'reimbursable' and
 * 'uncounted' may be absent in older data; resolve with `resolveSpecialCategoryLabels`.
 */
export interface SpecialCategoryLabels {
  fixedCost: string;
  unforeseen: string;
  reimbursable?: string;
  uncounted?: string;
}

/** Every special-category label filled in (what the UI renders). */
export type ResolvedSpecialCategoryLabels = Required<SpecialCategoryLabels>;

/** Hex colors for the special (non-envelope) categories. */
export interface SpecialCategoryColors {
  fixedCost: string;
  unforeseen: string;
  reimbursable: string;
  uncounted: string;
}

/**
 * Everything the app does is a module ("módulo") each user turns on. Nothing is on for a new
 * account; the rules (dependencies, navigation, home cards) live in `lib/modules`.
 */
export interface ModuleFlags {
  /** Expenses and incomes of the month (the "Lançamentos" screen and the expense form). */
  expenses: boolean;
  /** Envelope budgeting: targets, "posso gastar", leftovers and closing the month. */
  budget: boolean;
  /**
   * The whole credit card: the "foi no cartão?" question, the registered cards, splitting a
   * purchase into instalments and the bill of each month, with its due date and "Fatura paga".
   */
  card: boolean;
  /** The "A receber" category (see CategoryKind). */
  reimbursable: boolean;
  /** History charts and the month-by-month table. */
  history: boolean;
  /** Recurring-expense templates. */
  recurring: boolean;
  /** Invested reserve (ETF split into buckets). */
  investments: boolean;
  /** Cash report (card/installment debt vs. reserve). */
  cash: boolean;
  /** Reminders and daily tasks, with push notifications. */
  reminders: boolean;
  /** Logging an expense by voice or free text (AI). */
  voice: boolean;
  /** Gmail keyword monitor. */
  gmail: boolean;
}

export type ModuleKey = keyof ModuleFlags;

/** An entry the bottom bar can hold: the home dashboard or a module that has a screen. */
export type NavKey = 'inicio' | ModuleKey;

/** Global (not month-scoped) budget configuration. */
export interface BudgetSettings {
  topics: TopicConfig[];
  specialCategories: SpecialCategoryLabels;
  /** May be absent or partial in older data; resolve with `resolveSpecialCategoryColors`. */
  specialCategoryColors?: Partial<SpecialCategoryColors>;
  /**
   * True once this account has finished (or skipped) the new-user wizard/tour at least
   * once. Absent/undefined is treated as true (already onboarded) — only a brand-new
   * account's first-ever settings row is created with this explicitly false.
   */
  onboardingCompleted?: boolean;
  /** Which modules this user turned on. Absent/partial means "off"; resolve with `resolveModules`. */
  modules?: Partial<ModuleFlags>;
  /**
   * The bottom bar the user picked, in order (without "Mais", which is always there). Absent or
   * null means the default; resolve with `resolveNav`.
   */
  nav?: NavKey[] | null;
  /** One-time notices ("Novidade" cards and the like) this account already dismissed, by key. */
  dismissedNotices?: string[];
  /** Which notification categories push to this account's devices; see `isNotificationCategoryOn`. */
  notificationPrefs?: Partial<Record<NotificationCategory, boolean>>;
  /**
   * The order the user picked for the Início cards in "Organizar Início". Absent or null means
   * the default (see `resolveHomeCards`).
   */
  homeOrder?: ModuleKey[] | null;
  /** Which of the resizable Início cards (the half-width tiles) the user stretched to full width. */
  homeCardSizes?: Partial<Record<ModuleKey, 'half' | 'full'>>;
}

export interface Income {
  id: string;
  source: string;
  amount: number;
  date?: string;
}

/** Where an expense came from. Absent means the expense form (the default). */
export type ExpenseSource =
  | 'form'
  | 'voice'
  | 'text'
  | 'recurring'
  | 'investment'
  | 'installment'
  | 'import';

export interface Expense {
  id: string;
  categoryKind: CategoryKind;
  /** Required when categoryKind is 'topic'. */
  topicId?: string;
  description: string;
  /** Always positive. */
  amount: number;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Marks a purchase that lands on the credit-card bill. */
  singleInstallmentCard?: boolean;
  /** Which registered card it landed on (module "Cartões"); absent means no card in particular. */
  cardId?: string;
  source?: ExpenseSource;
  /** Set when this expense is one instalment of a plan (see InstallmentPlan). */
  installmentId?: string;
  /** 1-based position of this instalment in its plan. */
  installmentNumber?: number;
}

/** How an instalment plan is accounted for (bot spec §4.8 and correction 9). */
export type InstallmentAccounting = 'installment' | 'upfront';

/**
 * A purchase split into `count` monthly charges on the card. The due dates, the instalment
 * amount, how many are left and when it ends are all computed (lib/budget/installments.ts),
 * never stored — that is what kept the spreadsheet showing plans that had already finished.
 */
export interface InstallmentPlan {
  id: string;
  name: string;
  categoryKind: CategoryKind;
  /** Required when categoryKind is 'topic'. */
  topicId?: string;
  /** ISO date (YYYY-MM-DD) of the first charge. */
  firstDebitDate: string;
  /**
   * ISO date (YYYY-MM-DD) of the purchase itself — the day it was bought, which is the month
   * the whole amount lands in the category when the plan is "à vista". Absent in older data;
   * fall back to `firstDebitDate`.
   */
  purchaseDate?: string;
  count: number;
  totalAmount: number;
  accounting: InstallmentAccounting;
  /** The card every charge of this plan lands on (module "Cartões"). */
  cardId?: string;
  /**
   * How many of the first charges were already paid **before** the purchase was registered here
   * — what makes it possible to enter a purchase that started months ago. Those charges are not
   * part of any bill, of any budget and of the debt: the months that already happened stay
   * exactly as they were. Absent means zero (the purchase starts with the app).
   */
  paidCount?: number;
  /**
   * How many of the **last** charges were paid ahead of time ("adiantar parcelas"). They leave
   * the plan the same way: no bill, no budget, no debt — what was actually paid becomes one
   * expense of its own, in the competence the person paid it.
   */
  advancedCount?: number;
}

/** A template for an expense that repeats every month (the bot's "custos fixos"). */
export interface RecurringExpense {
  id: string;
  categoryKind: CategoryKind;
  /** Required when categoryKind is 'topic'. */
  topicId?: string;
  description: string;
  amount: number;
  /** Whether launching it marks the expense as a card purchase. */
  card: boolean;
  /** The card it is paid with, when it is a card purchase (module "Cartões"). */
  cardId?: string;
}

/** Whether a card's bill for a competence falls due in that same month or in the next one. */
export type CardDueMonth = 'same' | 'next';

/**
 * A credit card the person registered (module "Cartões"). Only what they typed is stored: the
 * due date of each bill, whether it was pushed off a weekend and how late it is are computed
 * (lib/budget/cards.ts).
 */
export interface CreditCard {
  id: string;
  name: string;
  /** Day of the month the bill is due; a month without that day uses its last day. */
  dueDay: number;
  dueMonth: CardDueMonth;
  /** Whether this card's bill notifies at all. */
  notifyEnabled: boolean;
  /** Extra notice before the due date, in days (0 = only on the day itself). */
  notifyBeforeDays: number;
  /** Pre-selected wherever a purchase picks a card; at most one card per person has it. */
  isDefault: boolean;
  /** Credit limit, to show how much of it is still free. Absent means "not being tracked". */
  limit?: number;
  /** Hex color (e.g. "#2a78d6") that identifies the card in the lists. */
  color?: string;
  order: number;
}

/**
 * "Fatura paga": one bill of one card, in one competence. `cardId` is a registered card's id or
 * `UNASSIGNED_CARD_ID` — the "Não informado" bill leaves the debt the same way, by being marked
 * as paid, and no bill in Capital ever leaves on its own.
 */
export interface CardBillPayment {
  cardId: string;
  month: Month;
  /** What the bill was worth when it was marked as paid. */
  amount: number;
  /** ISO instant. */
  paidAt: string;
}

/** Each person's own settings for the bill notices. */
export interface CardSettings {
  /** "HH:MM" the notices go out at. */
  notifyTime: string;
  /** Keep warning once a day while a bill is not marked as paid. */
  repeatUntilPaid: boolean;
}

/** The invested reserve: an ETF position (quotas of `ticker`) used as an emergency fund. */
export interface InvestmentReserve {
  ticker: string;
  totalQuotas: number;
}

/** A slice of the invested reserve earmarked for a topic. Shown as "categoria" in the app, never "balde". */
export interface InvestmentBucket {
  id: string;
  name: string;
  /** The envelope this bucket saves for; the allocation expense lands there. */
  topicId?: string;
  quotas: number;
}

/** Where a price came from: B3's own quotation service or, when it fails, Yahoo Finance. */
export type PriceSource = 'b3' | 'yahoo';

/** Last known price of a ticker, shared by every account. */
export interface PriceQuote {
  ticker: string;
  price: number;
  /** ISO timestamp of when the price was fetched. */
  fetchedAt: string;
  /** The asset's name as the source gave it. */
  name?: string;
  source?: PriceSource;
}

/** One line of the "if I lost my income" monthly cost. */
export interface EmergencyCost {
  label: string;
  amount: number;
}

/** What the cash report needs from the user, per account. */
export interface CashSettings {
  /** Money sitting in the bank account, outside investments. */
  reserveAccountAmount: number;
  emergencyCosts: EmergencyCost[];
  /** How many months of emergency costs the reserve should cover (6 by default). */
  reserveMultiplier: number;
}

/** All data for a single competence month. */
export interface MonthData {
  month: Month;
  incomes: Income[];
  expenses: Expense[];
  /** Rollover from the previous month's `remaining`, keyed by topic id. Frozen when the month closes. */
  carryIn: Record<string, number>;
  /**
   * Snapshot of the topic configuration in effect for this month (id, name, targetPct, order).
   * Captured when the month is created so that later edits to BudgetSettings never
   * change the math of a past month.
   */
  topicsSnapshot: TopicConfig[];
  closed?: boolean;
}
