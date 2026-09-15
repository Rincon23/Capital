/**
 * One-time migration: Supabase (the previous backend) → the Postgres on the Orange Pi.
 *
 *   SUPABASE_DB_URL=… npx tsx scripts/migrate-from-supabase.ts            rehearsal (default)
 *   SUPABASE_DB_URL=… DATABASE_URL=… npx tsx scripts/migrate-from-supabase.ts --write
 *
 * Copies every account (same id, same e-mail and the same bcrypt password hash, so nobody
 * needs a new password) with its settings and all of its months; the months' jsonb is
 * split into months / incomes / expenses. Nothing is written if any source row is invalid.
 *
 * Without --write the whole import is rehearsed on an in-memory Postgres (PGlite). Either
 * way, after importing, each month's summary is recomputed from what was stored and must
 * match the one computed from Supabase exactly. Running it again replaces each migrated
 * account's data with Supabase's current data.
 *
 * SUPABASE_DB_URL: Supabase dashboard → Connect → "Session pooler" connection string.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { loadEnvConfig } from '@next/env';
import { and, eq } from 'drizzle-orm';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Client, Pool } from 'pg';
import type { ZodError } from 'zod';
import { computeMonthSummary } from '../lib/budget/calculations';
import type { BudgetSettings, MonthData } from '../lib/budget/types';
import { PostgresBudgetRepository } from '../lib/server/budgetRepository';
import * as schema from '../lib/server/db/schema';
import type { Database } from '../lib/server/db/types';
import { monthDataSchema, settingsSchema } from '../lib/server/validation';

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

interface SourceUser {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
  deleted_at?: Date | null;
  is_anonymous?: boolean | null;
}

interface SourceSettings {
  user_id: string;
  topics: unknown;
  special_categories: unknown;
  special_category_colors: unknown;
  onboarding_completed: boolean | null;
}

interface SourceMonth {
  user_id: string;
  month: string;
  incomes: unknown;
  expenses: unknown;
  carry_in: unknown;
  topics_snapshot: unknown;
  closed: boolean | null;
}

interface AccountToMigrate {
  user: SourceUser & { email: string };
  settings?: BudgetSettings;
  /** The months as Supabase has them, for the summary check. */
  sourceMonths: MonthData[];
  /** The same months, validated, to import. */
  months: MonthData[];
}

function describeZod(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('; ');
}

async function readSupabase(url: string) {
  // Supabase's certificate chain isn't in Node's store; the connection is still encrypted.
  // sslmode is dropped from the URL because pg would let it override the `ssl` option.
  const cleanUrl = new URL(url);
  cleanUrl.searchParams.delete('sslmode');
  const client = new Client({
    connectionString: cleanUrl.toString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const users = await client.query<SourceUser>('select * from auth.users order by created_at');
    const settings = await client.query<SourceSettings>('select * from public.budget_settings');
    const months = await client.query<SourceMonth>(
      'select * from public.months order by user_id, month',
    );
    return { users: users.rows, settings: settings.rows, months: months.rows };
  } finally {
    await client.end();
  }
}

function prepareAccounts(
  source: Awaited<ReturnType<typeof readSupabase>>,
  problems: string[],
  warnings: string[],
): AccountToMigrate[] {
  const settingsByUser = new Map(source.settings.map((row) => [row.user_id, row]));
  const monthsByUser = new Map<string, SourceMonth[]>();
  for (const row of source.months) {
    monthsByUser.set(row.user_id, [...(monthsByUser.get(row.user_id) ?? []), row]);
  }

  const accounts: AccountToMigrate[] = [];
  for (const user of source.users) {
    if (user.deleted_at || user.is_anonymous || !user.email) {
      warnings.push(`conta ${user.email ?? user.id} ignorada (apagada, anônima ou sem e-mail)`);
      continue;
    }
    const label = user.email;

    let settings: BudgetSettings | undefined;
    const settingsRow = settingsByUser.get(user.id);
    if (settingsRow) {
      const parsed = settingsSchema.safeParse({
        topics: settingsRow.topics,
        specialCategories: settingsRow.special_categories,
        specialCategoryColors: settingsRow.special_category_colors ?? {},
        onboardingCompleted: settingsRow.onboarding_completed ?? true,
      });
      if (parsed.success) settings = parsed.data;
      else problems.push(`${label}: configurações inválidas — ${describeZod(parsed.error)}`);
    }

    const sourceMonths: MonthData[] = [];
    const months: MonthData[] = [];
    const seenIncomeIds = new Set<string>();
    const seenExpenseIds = new Set<string>();
    for (const row of monthsByUser.get(user.id) ?? []) {
      const raw = {
        month: row.month,
        incomes: row.incomes ?? [],
        expenses: row.expenses ?? [],
        carryIn: row.carry_in ?? {},
        topicsSnapshot: row.topics_snapshot ?? [],
        closed: row.closed ?? false,
      };
      const parsed = monthDataSchema.safeParse(raw);
      if (!parsed.success) {
        problems.push(`${label} ${row.month}: ${describeZod(parsed.error)}`);
        continue;
      }
      const month = parsed.data;
      // Ids must be unique per account in the new schema; the old one only needed them per month.
      for (const income of month.incomes) {
        if (seenIncomeIds.has(income.id)) {
          warnings.push(`${label} ${row.month}: renda com id repetido (${income.id}) ganhou um id novo`);
          income.id = randomUUID();
        }
        seenIncomeIds.add(income.id);
      }
      for (const expense of month.expenses) {
        if (seenExpenseIds.has(expense.id)) {
          warnings.push(`${label} ${row.month}: gasto com id repetido (${expense.id}) ganhou um id novo`);
          expense.id = randomUUID();
        }
        seenExpenseIds.add(expense.id);
      }
      sourceMonths.push(raw as MonthData);
      months.push(month);
    }

    if (!settings && months.length > 0) problems.push(`${label}: tem meses, mas não tem configurações`);
    accounts.push({ user: { ...user, email: user.email }, settings, sourceMonths, months });
  }
  return accounts;
}

/** Imports every account into `db` and returns the months whose data did not come out identical. */
async function importAccounts(db: Database, accounts: AccountToMigrate[]): Promise<string[]> {
  const mismatches: string[] = [];

  for (const { user, settings, sourceMonths, months } of accounts) {
    const verified = user.email_confirmed_at != null;
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.user)
        .values({
          id: user.id,
          name: user.email.split('@')[0],
          email: user.email,
          emailVerified: verified,
          createdAt: user.created_at ?? new Date(),
          updatedAt: user.updated_at ?? new Date(),
        })
        .onConflictDoUpdate({
          target: schema.user.id,
          set: { email: user.email, emailVerified: verified },
        });
      await tx
        .delete(schema.account)
        .where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, 'credential')));
      if (user.encrypted_password) {
        await tx.insert(schema.account).values({
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: user.encrypted_password,
        });
      }
    });

    if (!settings) continue;
    const repo = new PostgresBudgetRepository(db, user.id);
    await repo.importData({ version: 1, exportedAt: new Date().toISOString(), settings, months });

    for (const source of sourceMonths) {
      const stored = await repo.getMonth(source.month);
      const same =
        stored !== undefined &&
        stored.incomes.length === source.incomes.length &&
        stored.expenses.length === source.expenses.length &&
        isDeepStrictEqual(computeMonthSummary(stored), computeMonthSummary(source));
      if (!same) mismatches.push(`${user.email} ${source.month}`);
    }
  }
  return mismatches;
}

function printReport(accounts: AccountToMigrate[]): void {
  console.table(
    accounts.map(({ user, settings, months }) => ({
      conta: user.email,
      'e-mail confirmado': user.email_confirmed_at ? 'sim' : 'não',
      senha: user.encrypted_password ? 'mantida' : 'sem senha',
      configurações: settings ? 'sim' : 'não',
      meses: months.length,
      rendas: months.reduce((total, m) => total + m.incomes.length, 0),
      gastos: months.reduce((total, m) => total + m.expenses.length, 0),
    })),
  );
}

async function main() {
  loadEnvConfig(process.cwd());
  const write = process.argv.includes('--write');

  const sourceUrl = process.env.SUPABASE_DB_URL;
  if (!sourceUrl) {
    throw new Error('Defina SUPABASE_DB_URL (Supabase → Connect → "Session pooler").');
  }

  console.log('Lendo o Supabase…');
  const problems: string[] = [];
  const warnings: string[] = [];
  const accounts = prepareAccounts(await readSupabase(sourceUrl), problems, warnings);
  printReport(accounts);
  for (const warning of warnings) console.warn(`aviso: ${warning}`);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`ERRO: ${problem}`);
    throw new Error(`${problems.length} problema(s) nos dados do Supabase. Nada foi gravado.`);
  }

  const monthCount = accounts.reduce((total, a) => total + a.months.length, 0);

  if (!write) {
    console.log('\nEnsaio num Postgres em memória (nada é gravado no destino)…');
    const rehearsal = drizzlePglite({ client: new PGlite(), schema });
    await migratePglite(rehearsal, { migrationsFolder: MIGRATIONS_FOLDER });
    const mismatches = await importAccounts(rehearsal, accounts);
    if (mismatches.length > 0) {
      throw new Error(`Os resumos não bateram depois de importar: ${mismatches.join(', ')}.`);
    }
    console.log(
      `Ensaio ok: ${accounts.length} conta(s) e ${monthCount} mês(es), todos os resumos idênticos.\n` +
        'Rode de novo com --write (e DATABASE_URL apontando para o destino) para gravar.',
    );
    return;
  }

  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) throw new Error('Defina DATABASE_URL (o banco de destino).');
  const target = new URL(targetUrl);
  console.log(`\nGravando em ${target.hostname}:${target.port || 5432}${target.pathname}…`);

  const pool = new Pool({ connectionString: targetUrl, max: 2 });
  try {
    const db = drizzleNodePg({ client: pool, schema });
    await migrateNodePg(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const mismatches = await importAccounts(db, accounts);
    if (mismatches.length > 0) {
      throw new Error(`Gravado, mas estes meses não bateram: ${mismatches.join(', ')}. Confira antes de usar.`);
    }
    console.log(
      `Migração concluída: ${accounts.length} conta(s) e ${monthCount} mês(es), todos os resumos idênticos.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
