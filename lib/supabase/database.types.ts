/**
 * Hand-written Supabase schema types for the tables in
 * `supabase/migrations/20260910120000_capital_cloud.sql`. Kept in sync with that
 * migration by hand (the project is small); `supabase gen types typescript`
 * could generate this later.
 *
 * These must be `type` aliases, not `interface`s: the Supabase client's schema
 * generic requires each Row/Insert/Update to satisfy `Record<string, unknown>`,
 * which object-literal types get for free but interfaces do not.
 *
 * The jsonb columns are typed with the domain types from `lib/budget` so the
 * repository never has to cast.
 */
import type { Expense, Income, SpecialCategoryLabels, TopicConfig } from '@/lib/budget';

export type MonthRow = {
  user_id: string;
  month: string;
  incomes: Income[];
  expenses: Expense[];
  carry_in: Record<string, number>;
  topics_snapshot: TopicConfig[];
  closed: boolean;
  updated_at: string;
};

/** `user_id` defaults to `auth.uid()`; `closed`/`updated_at` have DB defaults. */
export type MonthInsert = Pick<
  MonthRow,
  'month' | 'incomes' | 'expenses' | 'carry_in' | 'topics_snapshot'
> & {
  user_id?: string;
  closed?: boolean;
};

export type BudgetSettingsRow = {
  user_id: string;
  topics: TopicConfig[];
  special_categories: SpecialCategoryLabels;
  updated_at: string;
};

export type BudgetSettingsInsert = Pick<BudgetSettingsRow, 'topics' | 'special_categories'> & {
  user_id?: string;
};

export type ProfileRow = {
  id: string;
  email: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: { id: string; email?: string | null; created_at?: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      budget_settings: {
        Row: BudgetSettingsRow;
        Insert: BudgetSettingsInsert;
        Update: Partial<BudgetSettingsRow>;
        Relationships: [];
      };
      months: {
        Row: MonthRow;
        Insert: MonthInsert;
        Update: Partial<MonthRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
  };
};
