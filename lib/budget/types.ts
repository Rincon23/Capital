/**
 * Domain types for the Capital budgeting app.
 * These types have no dependency on React or on any storage technology,
 * so the same definitions serve the pure calculation layer, the storage
 * layer, and the UI.
 */

/** Competence month, formatted "YYYY-MM" (e.g. "2026-09"). */
export type Month = string;

/**
 * Kind of expense category. 'reimbursable' ("A receber") is a card purchase made for
 * someone else who will pay it back: it lands on the card bill but consumes no envelope.
 */
export type CategoryKind = 'topic' | 'fixedCost' | 'unforeseen' | 'reimbursable';

/** A budget envelope ("Diversos", "Investimentos", ...). */
export interface TopicConfig {
  id: string;
  name: string;
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
 * Optional features ("módulos do assistente"), each one off until the user turns it on in
 * Settings. An account with nothing turned on sees exactly the budgeting app of before.
 */
export interface ModuleFlags {
  /** The "A receber" category (see CategoryKind). */
  reimbursable: boolean;
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
  /** Which optional modules this user turned on. Absent/partial means "off"; resolve with `resolveModules`. */
  modules?: Partial<ModuleFlags>;
}

export interface Income {
  id: string;
  source: string;
  amount: number;
  date?: string;
}

/**
 * Prepared for v2 (installment card purchases). Not used by any v1
 * calculation; a plan is only ever attached to an expense for future use.
 */
export interface InstallmentPlan {
  totalAmount: number;
  installmentCount: number;
  startMonth: Month;
  installmentAmount: number;
  currentInstallment: number;
}

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
  /** v2 preparation only, see InstallmentPlan. */
  installmentPlan?: InstallmentPlan;
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
