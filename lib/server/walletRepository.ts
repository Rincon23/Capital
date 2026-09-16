import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { computeMonthSummary } from '../budget/calculations';
import { computeCashReport, createDefaultCashSettings } from '../budget/cash';
import { currentMonthKey, todayISO } from '../budget/date';
import { createId } from '../budget/id';
import {
  installmentDebt,
  installmentExpense,
  installmentsDueIn,
  upfrontExpense,
} from '../budget/installments';
import { isPriceStale, quotasForAmount, summarizeInvestments } from '../budget/investments';
import { round2 } from '../budget/money';
import type {
  CashSettings,
  Expense,
  InstallmentPlan,
  InvestmentBucket,
  InvestmentReserve,
  Month,
  PriceQuote,
  RecurringExpense,
} from '../budget/types';
import type {
  AllocateInput,
  UpfrontLaunch,
  WalletRepository,
  WalletSnapshot,
} from '../storage/wallet';
import type { PostgresBudgetRepository } from './budgetRepository';
import {
  cashSettings,
  expenses,
  installments,
  investmentBuckets,
  investmentReserves,
  months,
  priceCache,
  recurringExpenses,
} from './db/schema';
import type { Database } from './db/types';
import { HttpError } from './httpError';
import { fetchQuote } from './quotes';

/** The ticker the app starts from; every user can change it in the Reserva screen. */
export const DEFAULT_TICKER = 'AUPO11';

/** A cached price older than this is refreshed the next time the Carteira is opened. */
const AUTO_REFRESH_MINUTES = 15;
/** How long opening the Carteira waits for that refresh before showing the cached price. */
const AUTO_REFRESH_WAIT_MS = 4_000;

/**
 * The Carteira on Postgres, scoped to one user. Anything that also creates an expense (launching
 * an instalment, allocating money to a bucket) runs inside the budget repository's transaction,
 * so the envelope and the carryIn cascade stay consistent with the wallet's own tables.
 */
export class PostgresWalletRepository implements WalletRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
    private readonly budget: PostgresBudgetRepository,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getSnapshot(): Promise<WalletSnapshot> {
    const today = todayISO();
    const [recurring, plans, reserve, buckets, settings] = await Promise.all([
      this.listRecurring(),
      this.listInstallments(),
      this.readReserve(),
      this.listBuckets(),
      this.readCashSettings(),
    ]);

    const quote = await this.currentQuote(reserve, buckets);
    const investments = summarizeInvestments(reserve, buckets, quote);
    const card = await this.openMonthCard();

    return {
      recurring,
      installments: plans,
      investments,
      cash: {
        settings,
        report: computeCashReport({
          settings,
          investedReserve: investments.freeValue,
          cardDebt: -card.cardTotal,
          installmentDebt: installmentDebt(plans, today, await this.launchedInstallmentIds()),
          cardMonth: card.month,
        }),
      },
      today,
    };
  }

  /**
   * The card bill of the open month: the most recent month that is not closed, or the current
   * month when every month is closed (or none exists yet).
   */
  private async openMonthCard(): Promise<{ month: Month; cardTotal: number }> {
    const [open] = await this.db
      .select({ month: months.month })
      .from(months)
      .where(and(eq(months.userId, this.userId), eq(months.closed, false)))
      .orderBy(desc(months.month))
      .limit(1);

    const month = open?.month ?? currentMonthKey();
    const data = await this.budget.peekMonth(month);
    return { month, cardTotal: computeMonthSummary(data).cardTotal };
  }

  /** Ids of the instalment charges that already are an expense, so they are not owed twice. */
  private async launchedInstallmentIds(): Promise<Set<string>> {
    const rows = await this.db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.userId, this.userId), isNotNull(expenses.installmentId)));
    return new Set(rows.map((row) => row.id));
  }

  private async listRecurring(): Promise<RecurringExpense[]> {
    const rows = await this.db
      .select()
      .from(recurringExpenses)
      .where(eq(recurringExpenses.userId, this.userId))
      .orderBy(asc(recurringExpenses.position));
    return rows.map((row) => ({
      id: row.id,
      categoryKind: row.categoryKind,
      ...(row.topicId ? { topicId: row.topicId } : {}),
      description: row.description,
      amount: row.amount,
      card: row.card,
    }));
  }

  private async listInstallments(): Promise<InstallmentPlan[]> {
    const rows = await this.db
      .select()
      .from(installments)
      .where(eq(installments.userId, this.userId))
      .orderBy(asc(installments.createdAt));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryKind: row.categoryKind,
      ...(row.topicId ? { topicId: row.topicId } : {}),
      firstDebitDate: row.firstDebitDate,
      count: row.count,
      totalAmount: row.totalAmount,
      accounting: row.accounting,
    }));
  }

  private async readReserve(): Promise<InvestmentReserve> {
    const [row] = await this.db
      .select()
      .from(investmentReserves)
      .where(eq(investmentReserves.userId, this.userId));
    return row
      ? { ticker: row.ticker, totalQuotas: row.totalQuotas }
      : { ticker: DEFAULT_TICKER, totalQuotas: 0 };
  }

  private async listBuckets(): Promise<InvestmentBucket[]> {
    const rows = await this.db
      .select()
      .from(investmentBuckets)
      .where(eq(investmentBuckets.userId, this.userId))
      .orderBy(asc(investmentBuckets.position));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ...(row.topicId ? { topicId: row.topicId } : {}),
      quotas: row.quotas,
    }));
  }

  private async readQuote(ticker: string): Promise<PriceQuote | null> {
    const [row] = await this.db.select().from(priceCache).where(eq(priceCache.ticker, ticker));
    if (!row) return null;
    return {
      ticker: row.ticker,
      price: row.price,
      fetchedAt: row.fetchedAt.toISOString(),
      ...(row.name ? { name: row.name } : {}),
      ...(row.source === 'b3' || row.source === 'yahoo' ? { source: row.source } : {}),
    };
  }

  /**
   * The cached price, refreshed first when it is older than AUTO_REFRESH_MINUTES and this user
   * actually holds something (quotas or buckets) — the sources are free, so there is no reason
   * to make anyone press "Atualizar". A slow or failed refresh never blocks the screen: after
   * AUTO_REFRESH_WAIT_MS the cached price is shown, and the refresh still lands in the cache.
   */
  private async currentQuote(
    reserve: InvestmentReserve,
    buckets: InvestmentBucket[],
  ): Promise<PriceQuote | null> {
    const cached = await this.readQuote(reserve.ticker);
    const holdsSomething = reserve.totalQuotas > 0 || buckets.length > 0;
    if (!holdsSomething || !isPriceStale(cached?.fetchedAt, new Date(), AUTO_REFRESH_MINUTES)) {
      return cached;
    }

    const refreshed = this.storeQuote(reserve.ticker).catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const gaveUp = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), AUTO_REFRESH_WAIT_MS);
    });
    const fresh = await Promise.race([refreshed, gaveUp]);
    clearTimeout(timer);
    return fresh ?? cached;
  }

  private async readCashSettings(): Promise<CashSettings> {
    const [row] = await this.db.select().from(cashSettings).where(eq(cashSettings.userId, this.userId));
    if (!row) return createDefaultCashSettings();
    return {
      reserveAccountAmount: row.reserveAccountAmount,
      emergencyCosts: row.emergencyCosts,
      reserveMultiplier: row.reserveMultiplier,
    };
  }

  // -------------------------------------------------------------------------
  // Recurring expenses
  // -------------------------------------------------------------------------

  async saveRecurring(item: RecurringExpense): Promise<void> {
    const values = {
      categoryKind: item.categoryKind,
      topicId: item.topicId ?? null,
      description: item.description,
      amount: item.amount,
      card: item.card,
    };
    const [last] = await this.db
      .select({ position: sql<number | null>`max(${recurringExpenses.position})` })
      .from(recurringExpenses)
      .where(eq(recurringExpenses.userId, this.userId));
    await this.db
      .insert(recurringExpenses)
      .values({ userId: this.userId, id: item.id, position: (last?.position ?? -1) + 1, ...values })
      .onConflictDoUpdate({ target: [recurringExpenses.userId, recurringExpenses.id], set: values });
  }

  async deleteRecurring(id: string): Promise<void> {
    await this.db
      .delete(recurringExpenses)
      .where(and(eq(recurringExpenses.userId, this.userId), eq(recurringExpenses.id, id)));
  }

  // -------------------------------------------------------------------------
  // Instalment plans
  // -------------------------------------------------------------------------

  async saveInstallment(plan: InstallmentPlan, upfront?: UpfrontLaunch): Promise<void> {
    const values = {
      name: plan.name,
      categoryKind: plan.categoryKind,
      topicId: plan.topicId ?? null,
      firstDebitDate: plan.firstDebitDate,
      count: plan.count,
      totalAmount: plan.totalAmount,
      accounting: plan.accounting,
    };

    await this.budget.writeWith(async ({ tx, addExpense, openMonths }) => {
      await tx
        .insert(installments)
        .values({ userId: this.userId, id: plan.id, ...values })
        .onConflictDoUpdate({ target: [installments.userId, installments.id], set: values });

      if (plan.accounting === 'installment') {
        // Charge the months that already exist and are still open; the unique key makes this
        // safe to run again, and months created later get their charge when they are created.
        for (const month of await openMonths()) {
          for (const { number, dueDate } of installmentsDueIn([plan], month)) {
            await addExpense(month, installmentExpense(plan, number, dueDate));
          }
        }
      } else if (upfront) {
        await addExpense(upfront.month, upfrontExpense(plan, createId(), upfront.date));
      }
    });
  }

  /**
   * Deletes the plan. The charges that already became an expense in a **past** date stay (they
   * really were charged); the ones still ahead are removed from the open months.
   */
  async deleteInstallment(id: string): Promise<void> {
    const today = todayISO();
    await this.budget.writeWith(async ({ tx, touch, openMonths }) => {
      const deleted = await tx
        .delete(installments)
        .where(and(eq(installments.userId, this.userId), eq(installments.id, id)))
        .returning({ id: installments.id });
      if (deleted.length === 0) return;

      const open = await openMonths();
      if (open.length === 0) return;

      const removed = await tx
        .delete(expenses)
        .where(
          and(
            eq(expenses.userId, this.userId),
            eq(expenses.installmentId, id),
            sql`${expenses.date} > ${today}`,
            inArray(expenses.month, open),
          ),
        )
        .returning({ month: expenses.month });
      for (const row of removed) touch(row.month);
    });
  }

  // -------------------------------------------------------------------------
  // Invested reserve
  // -------------------------------------------------------------------------

  async setTicker(ticker: string): Promise<void> {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) throw new HttpError(400, 'INVALID_INPUT', 'Informe o código do ativo.');
    await this.upsertReserve({ ticker: normalized });
  }

  async tradeQuotas(delta: number): Promise<void> {
    const reserve = await this.readReserve();
    const total = reserve.totalQuotas + delta;
    if (total < 0) {
      throw new HttpError(
        400,
        'NOT_ENOUGH_QUOTAS',
        `Você tem ${reserve.totalQuotas} cotas; não dá para vender ${Math.abs(delta)}.`,
      );
    }
    await this.upsertReserve({ totalQuotas: total });
  }

  async saveBucket(bucket: InvestmentBucket): Promise<void> {
    const values = {
      name: bucket.name,
      topicId: bucket.topicId ?? null,
      quotas: bucket.quotas,
    };
    const [last] = await this.db
      .select({ position: sql<number | null>`max(${investmentBuckets.position})` })
      .from(investmentBuckets)
      .where(eq(investmentBuckets.userId, this.userId));
    await this.db
      .insert(investmentBuckets)
      .values({ userId: this.userId, id: bucket.id, position: (last?.position ?? -1) + 1, ...values })
      .onConflictDoUpdate({ target: [investmentBuckets.userId, investmentBuckets.id], set: values });
  }

  async deleteBucket(id: string): Promise<void> {
    await this.db
      .delete(investmentBuckets)
      .where(and(eq(investmentBuckets.userId, this.userId), eq(investmentBuckets.id, id)));
  }

  /**
   * Moves `amount` into a bucket: the money buys quotas for it (taken from the free reserve) and
   * the bucket's envelope is charged, exactly as the bot did. Both happen in one transaction.
   */
  async allocate(input: AllocateInput): Promise<void> {
    const reserve = await this.readReserve();
    const quote = await this.readQuote(reserve.ticker);
    if (!quote) {
      throw new HttpError(
        409,
        'NO_QUOTE',
        `Sem cotação de ${reserve.ticker}. Atualize a cotação antes de remanejar.`,
      );
    }

    const [bucket] = await this.db
      .select()
      .from(investmentBuckets)
      .where(and(eq(investmentBuckets.userId, this.userId), eq(investmentBuckets.id, input.bucketId)));
    if (!bucket) throw new HttpError(404, 'NOT_FOUND', 'Esse balde não existe mais.');
    if (!bucket.topicId) {
      throw new HttpError(
        400,
        'BUCKET_WITHOUT_TOPIC',
        `O balde "${bucket.name}" não está ligado a nenhuma categoria. Edite-o antes de remanejar.`,
      );
    }

    const quotas = quotasForAmount(input.amount, quote.price);
    const expense: Expense = {
      id: createId(),
      categoryKind: 'topic',
      topicId: bucket.topicId,
      description: reserve.ticker,
      amount: round2(input.amount),
      date: input.date,
      singleInstallmentCard: false,
      source: 'investment',
    };

    await this.budget.writeWith(async ({ tx, addExpense }) => {
      await tx
        .update(investmentBuckets)
        .set({ quotas: bucket.quotas + quotas })
        .where(and(eq(investmentBuckets.userId, this.userId), eq(investmentBuckets.id, bucket.id)));
      await addExpense(input.month, expense);
    });
  }

  /** Fetches a fresh price (B3, then Yahoo Finance — no token) and caches it for every account. */
  async refreshPrice(): Promise<void> {
    const { ticker } = await this.readReserve();
    await this.storeQuote(ticker);
  }

  private async storeQuote(ticker: string): Promise<PriceQuote> {
    const quote = await fetchQuote(ticker);
    const fetchedAt = new Date();
    const values = {
      price: quote.price,
      name: quote.name ?? null,
      source: quote.source,
      fetchedAt,
    };
    await this.db
      .insert(priceCache)
      .values({ ticker, ...values })
      .onConflictDoUpdate({ target: priceCache.ticker, set: values });
    return {
      ticker,
      price: quote.price,
      fetchedAt: fetchedAt.toISOString(),
      ...(quote.name ? { name: quote.name } : {}),
      source: quote.source,
    };
  }

  // -------------------------------------------------------------------------
  // Cash
  // -------------------------------------------------------------------------

  async saveCashSettings(settings: CashSettings): Promise<void> {
    const values = {
      reserveAccountAmount: settings.reserveAccountAmount,
      emergencyCosts: settings.emergencyCosts,
      reserveMultiplier: settings.reserveMultiplier,
    };
    await this.db
      .insert(cashSettings)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: cashSettings.userId, set: values });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async upsertReserve(patch: Partial<InvestmentReserve>): Promise<void> {
    const current = await this.readReserve();
    const values = {
      ticker: patch.ticker ?? current.ticker,
      totalQuotas: patch.totalQuotas ?? current.totalQuotas,
    };
    await this.db
      .insert(investmentReserves)
      .values({ userId: this.userId, ...values })
      .onConflictDoUpdate({ target: investmentReserves.userId, set: values });
  }
}
