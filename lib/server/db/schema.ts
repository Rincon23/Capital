/**
 * Postgres schema (Drizzle). Migrations are generated from this file with
 * `npm run db:generate` into /drizzle and applied on server start (instrumentation.ts).
 *
 * Budget data is normalized (months / incomes / expenses), but the repository
 * reassembles the exact `MonthData` shape from lib/budget, so the pure
 * calculation layer never changes because of the database.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  CategoryKind,
  SpecialCategoryColors,
  SpecialCategoryLabels,
  TopicConfig,
} from '../../budget/types';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Auth (Better Auth). The export names (user, session, account, verification)
// and property names are the model/field names Better Auth looks up; the SQL
// names are snake_case. Ids are UUIDs so accounts migrated from Supabase keep
// their original ids.
// ---------------------------------------------------------------------------
export const user = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Scrypt hash from Better Auth, or a bcrypt hash carried over from Supabase. */
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/** One row per user: envelope config + special category labels/colors (the `BudgetSettings` shape). */
export const budgetSettings = pgTable('budget_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  topics: jsonb('topics').$type<TopicConfig[]>().notNull(),
  specialCategories: jsonb('special_categories').$type<SpecialCategoryLabels>().notNull(),
  specialCategoryColors: jsonb('special_category_colors')
    .$type<Partial<SpecialCategoryColors>>()
    .notNull()
    .default({}),
  /** Only a brand-new account's first row is created with false (see the repository's seed). */
  onboardingCompleted: boolean('onboarding_completed').notNull().default(true),
  updatedAt: updatedAt(),
});

/** One row per (user, competence month "YYYY-MM"). carryIn and topicsSnapshot keep the MonthData shape. */
export const months = pgTable(
  'months',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    month: text('month').notNull(),
    carryIn: jsonb('carry_in').$type<Record<string, number>>().notNull().default({}),
    topicsSnapshot: jsonb('topics_snapshot').$type<TopicConfig[]>().notNull().default([]),
    closed: boolean('closed').notNull().default(false),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.month] }),
    check('months_month_format', sql`${t.month} ~ '^[0-9]{4}-[0-9]{2}$'`),
  ],
);

/**
 * Ids are the client-generated ids of the MonthData entries (text: backups and old
 * local data may carry non-UUID ids), unique per user. `position` keeps the order
 * the entries had in the month, which is the order the UI lists them in.
 */
export const incomes = pgTable(
  'incomes',
  {
    userId: uuid('user_id').notNull(),
    id: text('id').notNull(),
    month: text('month').notNull(),
    source: text('source').notNull(),
    amount: numeric('amount', { mode: 'number' }).notNull(),
    date: date('date', { mode: 'string' }),
    position: integer('position').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    foreignKey({
      columns: [t.userId, t.month],
      foreignColumns: [months.userId, months.month],
    }).onDelete('cascade'),
    index('incomes_user_month_idx').on(t.userId, t.month),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    userId: uuid('user_id').notNull(),
    id: text('id').notNull(),
    month: text('month').notNull(),
    categoryKind: text('category_kind').$type<CategoryKind>().notNull(),
    topicId: text('topic_id'),
    description: text('description').notNull(),
    amount: numeric('amount', { mode: 'number' }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    /** `Expense.singleInstallmentCard`: the purchase lands on the credit-card bill. */
    card: boolean('card').notNull().default(false),
    position: integer('position').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    foreignKey({
      columns: [t.userId, t.month],
      foreignColumns: [months.userId, months.month],
    }).onDelete('cascade'),
    index('expenses_user_month_idx').on(t.userId, t.month),
    check(
      'expenses_category_kind',
      sql`${t.categoryKind} in ('topic', 'fixedCost', 'unforeseen')`,
    ),
  ],
);
