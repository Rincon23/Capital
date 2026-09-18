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
 */
export type CategoryKind = 'topic' | 'fixedCost' | 'unforeseen' | 'reimbursable';

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
 * User-configurable labels for the special (non-envelope) categories. 'reimbursable' may be
 * absent in older data; resolve with `resolveSpecialCategoryLabels`.
 */
export interface SpecialCategoryLabels {
  fixedCost: string;
  unforeseen: string;
  reimbursable?: string;
}

/** Every special-category label filled in (what the UI renders). */
export type ResolvedSpecialCategoryLabels = Required<SpecialCategoryLabels>;

/** Hex colors for the special (non-envelope) categories. */
export interface SpecialCategoryColors {
  fixedCost: string;
  unforeseen: string;
  reimbursable: string;
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
  /** Marking card purchases and the monthly card bill. */
  card: boolean;
  /** The "A receber" category (see CategoryKind). */
  reimbursable: boolean;
  /** History charts and the month-by-month table. */
  history: boolean;
  /** Recurring-expense templates. */
  recurring: boolean;
  /** Installment plans. */
  installments: boolean;
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
  count: number;
  totalAmount: number;
  accounting: InstallmentAccounting;
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
