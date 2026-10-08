import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { createId } from '../budget/id';
import { isPriceStale } from '../budget/investments';
import { round2 } from '../budget/money';
import type { Expense, Month } from '../budget/types';
import {
  assetType,
  isFixedIncomeType,
  normalizeAssetTicker,
  isValidAssetTicker,
  priceCacheKey,
  DOLLAR_CACHE_KEY,
  RECOMMENDED_QUESTIONS,
  targetsComplete,
  type Answer,
  type AssetAnswers,
  type AssetInput,
  type AssetQuote,
  type ContributeInput,
  type DiagramAsset,
  type DiagramBackup,
  type DiagramContribution,
  type DiagramContributionItem,
  type DiagramOverview,
  type DiagramQuestion,
  type DiagramSettings,
  type DiagramTargets,
  type FixedIncomeTotal,
  type FixedIncomeType,
  type QuestionInput,
  type TickerType,
} from '../diagram';
import { isModuleOn } from '../modules';
import type { PostgresBudgetRepository } from './budgetRepository';
import {
  diagramAnswers,
  diagramAssets,
  diagramContributions,
  diagramFixedIncome,
  diagramQuestions,
  diagramSettings,
  priceCache,
} from './db/schema';
import type { Database, Transaction } from './db/types';
import { HttpError } from './httpError';
import { checkQuota, QUOTAS } from './quotas';
import { fetchMarketQuotes, searchTickers, type TickerSuggestion } from './quotes';

/** A cached price older than this is refreshed the next time the Diagrama is opened. */
const AUTO_REFRESH_MINUTES = 15;
/** How long opening the Diagrama waits for that refresh before showing the cached prices. */
const AUTO_REFRESH_WAIT_MS = 4_000;
/** How many registered aportes the screen receives (the history keeps them all). */
const RECENT_CONTRIBUTIONS = 30;

type AssetRow = typeof diagramAssets.$inferSelect;
type QuestionRow = typeof diagramQuestions.$inferSelect;
type Executor = Database | Transaction;

function toAsset(row: AssetRow): DiagramAsset {
  return {
    id: row.id,
    type: row.type,
    ticker: row.ticker,
    quantity: row.quantity,
    quantityUpdatedOn: row.quantityUpdatedOn,
    ...(row.sector ? { sector: row.sector } : {}),
    ...(row.subsector ? { subsector: row.subsector } : {}),
    ...(row.note ? { note: row.note } : {}),
    stopBuying: row.stopBuying,
    isEtf: row.isEtf,
    directScore: row.directScore,
    position: row.position,
  };
}

function toQuestion(row: QuestionRow): DiagramQuestion {
  return {
    id: row.id,
    type: row.type,
    criterion: row.criterion,
    text: row.text,
    ...(row.help ? { help: row.help } : {}),
    weight: row.weight,
    position: row.position,
  };
}

/** "" and whitespace are "não informado". */
function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/**
 * The Diagrama on Postgres, scoped to one user. Separate from the Reserva investida and from the
 * Reserva de emergência: nothing here reads or changes them. Only "Lançar em Investimentos" goes
 * through the budget repository, in its transaction, so the month stays consistent.
 */
export class PostgresDiagramRepository {
  constructor(
    private readonly db: Database,
    private readonly userId: string,
    private readonly budget: PostgresBudgetRepository,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getOverview(): Promise<DiagramOverview> {
    const [settings, assets, fixedIncome, questions, answers, contributions] = await Promise.all([
      this.readSettings(),
      this.listAssets(),
      this.listFixedIncome(),
      this.listQuestions(),
      this.readAnswers(),
      this.listContributions(RECENT_CONTRIBUTIONS),
    ]);
    const { quotes, dollar } = await this.currentQuotes(assets);
    return { settings, assets, fixedIncome, questions, answers, quotes, dollar, contributions };
  }

  private async readSettings(executor: Executor = this.db): Promise<DiagramSettings> {
    const [row] = await executor.select().from(diagramSettings).where(eq(diagramSettings.userId, this.userId));
    return { targets: row?.targets ?? {}, lastAmount: row?.lastAmount ?? null };
  }

  private async listAssets(executor: Executor = this.db): Promise<DiagramAsset[]> {
    const rows = await executor
      .select()
      .from(diagramAssets)
      .where(eq(diagramAssets.userId, this.userId))
      .orderBy(asc(diagramAssets.position), asc(diagramAssets.createdAt));
    return rows.map(toAsset);
  }

  private async listFixedIncome(executor: Executor = this.db): Promise<FixedIncomeTotal[]> {
    const rows = await executor
      .select()
      .from(diagramFixedIncome)
      .where(eq(diagramFixedIncome.userId, this.userId));
    return rows.map((row) => ({ type: row.type, amount: row.amount, updatedOn: row.updatedOn }));
  }

  private async listQuestions(executor: Executor = this.db): Promise<DiagramQuestion[]> {
    const rows = await executor
      .select()
      .from(diagramQuestions)
      .where(eq(diagramQuestions.userId, this.userId))
      .orderBy(asc(diagramQuestions.type), asc(diagramQuestions.position), asc(diagramQuestions.createdAt));
    return rows.map(toQuestion);
  }

  private async readAnswers(executor: Executor = this.db): Promise<Record<string, AssetAnswers>> {
    const rows = await executor.select().from(diagramAnswers).where(eq(diagramAnswers.userId, this.userId));
    const answers: Record<string, AssetAnswers> = {};
    for (const row of rows) (answers[row.assetId] ??= {})[row.questionId] = row.answer;
    return answers;
  }

  private async listContributions(limit?: number, executor: Executor = this.db): Promise<DiagramContribution[]> {
    const query = executor
      .select()
      .from(diagramContributions)
      .where(eq(diagramContributions.userId, this.userId))
      .orderBy(desc(diagramContributions.date), desc(diagramContributions.createdAt));
    const rows = limit ? await query.limit(limit) : await query;
    return rows.map((row) => ({ id: row.id, date: row.date, amount: row.amount, items: row.items }));
  }

  // -------------------------------------------------------------------------
  // Quotes
  // -------------------------------------------------------------------------

  /** The cached prices of these assets, in R$ (US$ ones converted with the cached dollar). */
  private async readQuotes(assets: DiagramAsset[]): Promise<Pick<DiagramOverview, 'quotes' | 'dollar'>> {
    const keys = [...new Set(assets.map((asset) => this.cacheKey(asset)))];
    const needsDollar = assets.some((asset) => assetType(asset.type).market === 'us');
    if (needsDollar) keys.push(DOLLAR_CACHE_KEY);
    const rows = keys.length > 0 ? await this.db.select().from(priceCache).where(inArray(priceCache.ticker, keys)) : [];
    const byKey = new Map(rows.map((row) => [row.ticker, row]));

    const dollarRow = byKey.get(DOLLAR_CACHE_KEY);
    const dollar: AssetQuote | null = dollarRow
      ? { price: dollarRow.price, fetchedAt: dollarRow.fetchedAt.toISOString() }
      : null;

    const quotes: Record<string, AssetQuote> = {};
    for (const asset of assets) {
      const row = byKey.get(this.cacheKey(asset));
      if (!row) continue;
      const us = assetType(asset.type).market === 'us';
      if (us && !dollar) continue;
      quotes[asset.id] = {
        price: us && dollar ? row.price * dollar.price : row.price,
        ...(row.name ? { name: row.name } : {}),
        fetchedAt: row.fetchedAt.toISOString(),
      };
    }
    return { quotes, dollar };
  }

  /**
   * The cached prices, refreshed first when any is missing or older than AUTO_REFRESH_MINUTES —
   * the sources are free, so nobody has to press "Atualizar". A slow or failed refresh never
   * blocks the screen: after AUTO_REFRESH_WAIT_MS the cached prices are shown.
   */
  private async currentQuotes(assets: DiagramAsset[]): Promise<Pick<DiagramOverview, 'quotes' | 'dollar'>> {
    const cached = await this.readQuotes(assets);
    const now = new Date();
    const stale =
      assets.some((asset) => isPriceStale(cached.quotes[asset.id]?.fetchedAt, now, AUTO_REFRESH_MINUTES)) ||
      (cached.dollar !== null && isPriceStale(cached.dollar.fetchedAt, now, AUTO_REFRESH_MINUTES));
    if (assets.length === 0 || !stale) return cached;

    const refreshed = this.storeQuotes(assets)
      .then(() => this.readQuotes(assets))
      .catch(() => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const gaveUp = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), AUTO_REFRESH_WAIT_MS);
    });
    const fresh = await Promise.race([refreshed, gaveUp]);
    clearTimeout(timer);
    return fresh ?? cached;
  }

  private cacheKey(asset: Pick<DiagramAsset, 'type' | 'ticker'>): string {
    return priceCacheKey(assetType(asset.type).market ?? 'b3', asset.ticker);
  }

  /** Asks the free sources for these assets (and the dollar) and caches what they answer. */
  private async storeQuotes(assets: Pick<DiagramAsset, 'type' | 'ticker'>[]): Promise<number> {
    const requests = assets.map((asset) => ({ market: assetType(asset.type).market ?? 'b3', ticker: asset.ticker }));
    const found = await fetchMarketQuotes(requests);
    const fetchedAt = new Date();
    for (const [key, quote] of found) {
      const values = { price: quote.price, name: quote.name ?? null, source: quote.source, fetchedAt };
      await this.db
        .insert(priceCache)
        .values({ ticker: key, ...values })
        .onConflictDoUpdate({ target: priceCache.ticker, set: values });
    }
    return found.size;
  }

  /** "Atualizar cotações": every asset of the account, now. */
  async refreshQuotes(): Promise<{ updated: number; missing: string[] }> {
    const assets = await this.listAssets();
    if (assets.length === 0) return { updated: 0, missing: [] };
    await this.storeQuotes(assets);
    const { quotes } = await this.readQuotes(assets);
    return {
      updated: Object.keys(quotes).length,
      missing: assets.filter((asset) => !quotes[asset.id]).map((asset) => asset.ticker),
    };
  }

  /** Suggestions while the person types a ticker of `type`. */
  async searchTickers(type: TickerType, query: string): Promise<TickerSuggestion[]> {
    const market = assetType(type).market ?? 'b3';
    return searchTickers(market, normalizeAssetTicker(market, query));
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  /**
   * The targets of the types in the portfolio. They add up to 100% — or there is no type at all.
   * A type left out is removed from the portfolio; its assets stay, waiting for it to come back.
   */
  async saveTargets(targets: DiagramTargets): Promise<void> {
    if (Object.keys(targets).length > 0 && !targetsComplete(targets)) {
      throw new HttpError(400, 'TARGETS_NOT_100', 'As metas precisam somar 100%.');
    }
    await this.db
      .insert(diagramSettings)
      .values({ userId: this.userId, targets })
      .onConflictDoUpdate({ target: diagramSettings.userId, set: { targets } });
  }

  async saveLastAmount(amount: number): Promise<void> {
    const lastAmount = round2(amount);
    await this.db
      .insert(diagramSettings)
      .values({ userId: this.userId, lastAmount })
      .onConflictDoUpdate({ target: diagramSettings.userId, set: { lastAmount } });
  }

  /** The total of a fixed-income type ("Continua igual" saves the same amount: the date moves). */
  async setFixedIncome(type: FixedIncomeType, amount: number, date: string): Promise<void> {
    const values = { amount: round2(Math.max(0, amount)), updatedOn: date };
    await this.db
      .insert(diagramFixedIncome)
      .values({ userId: this.userId, type, ...values })
      .onConflictDoUpdate({ target: [diagramFixedIncome.userId, diagramFixedIncome.type], set: values });
  }

  // -------------------------------------------------------------------------
  // Assets
  // -------------------------------------------------------------------------

  private normalize(input: AssetInput): { ticker: string } {
    const ticker = normalizeAssetTicker(assetType(input.type).market ?? 'b3', input.ticker);
    if (!isValidAssetTicker(ticker)) {
      throw new HttpError(400, 'INVALID_TICKER', 'Confira o código do ativo: só letras, números, ponto e traço.');
    }
    return { ticker };
  }

  private assetValues(input: AssetInput) {
    return {
      sector: optionalText(input.sector),
      subsector: optionalText(input.subsector),
      note: optionalText(input.note),
      stopBuying: input.stopBuying,
      isEtf: input.isEtf,
      directScore: input.directScore === null ? null : Math.min(1, Math.max(-1, input.directScore)),
    };
  }

  private duplicate(ticker: string): HttpError {
    return new HttpError(409, 'DUPLICATE_ASSET', `${ticker} já está na sua carteira, nesse tipo.`);
  }

  /** Adds an asset and tries to price it right away (a failed quote never refuses the asset). */
  async addAsset(input: AssetInput, date: string): Promise<DiagramAsset> {
    const { ticker } = this.normalize(input);
    const existing = await this.listAssets();
    checkQuota(existing.length, QUOTAS.diagramAssets, `Dá para ter até ${QUOTAS.diagramAssets} ativos no Diagrama.`);
    if (existing.some((asset) => asset.type === input.type && asset.ticker === ticker)) throw this.duplicate(ticker);

    const id = createId();
    const position = existing.reduce((max, asset) => Math.max(max, asset.position + 1), 0);
    await this.db.insert(diagramAssets).values({
      userId: this.userId,
      id,
      type: input.type,
      ticker,
      quantity: Math.max(0, input.quantity),
      quantityUpdatedOn: date,
      position,
      ...this.assetValues(input),
    });
    await this.storeQuotes([{ type: input.type, ticker }]).catch(() => 0);
    const [row] = await this.db
      .select()
      .from(diagramAssets)
      .where(and(eq(diagramAssets.userId, this.userId), eq(diagramAssets.id, id)));
    return toAsset(row);
  }

  async updateAsset(id: string, input: AssetInput, date: string): Promise<void> {
    const current = await this.findAsset(id);
    const { ticker } = this.normalize(input);
    if (input.type !== current.type) {
      throw new HttpError(400, 'TYPE_CHANGE', 'O tipo de um ativo não muda. Remova e adicione de novo no outro tipo.');
    }
    if (ticker !== current.ticker) {
      const clash = (await this.listAssets()).some(
        (asset) => asset.id !== id && asset.type === input.type && asset.ticker === ticker,
      );
      if (clash) throw this.duplicate(ticker);
    }
    const quantity = Math.max(0, input.quantity);
    await this.db
      .update(diagramAssets)
      .set({
        ticker,
        quantity,
        ...(quantity !== current.quantity ? { quantityUpdatedOn: date } : {}),
        ...this.assetValues(input),
      })
      .where(and(eq(diagramAssets.userId, this.userId), eq(diagramAssets.id, id)));
    if (ticker !== current.ticker) await this.storeQuotes([{ type: input.type, ticker }]).catch(() => 0);
  }

  /** "Não compro mais", straight from the list: the answers stay, unmarking gives the score back. */
  async setStopBuying(id: string, stopBuying: boolean): Promise<void> {
    await this.findAsset(id);
    await this.db
      .update(diagramAssets)
      .set({ stopBuying })
      .where(and(eq(diagramAssets.userId, this.userId), eq(diagramAssets.id, id)));
  }

  /** Removes an asset with its answers (the screen asks first). Past aportes keep their lines. */
  async deleteAsset(id: string): Promise<void> {
    await this.db.delete(diagramAssets).where(and(eq(diagramAssets.userId, this.userId), eq(diagramAssets.id, id)));
  }

  private async findAsset(id: string): Promise<DiagramAsset> {
    const [row] = await this.db
      .select()
      .from(diagramAssets)
      .where(and(eq(diagramAssets.userId, this.userId), eq(diagramAssets.id, id)));
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Esse ativo não existe mais.');
    return toAsset(row);
  }

  /** Sim (+1), Não (−1) or no answer (null) of an asset to a question of its own type. */
  async setAnswer(assetId: string, questionId: string, answer: Answer | null): Promise<void> {
    const asset = await this.findAsset(assetId);
    const question = await this.findQuestion(questionId);
    if (question.type !== asset.type) {
      throw new HttpError(400, 'WRONG_TYPE', 'Essa pergunta é de outro tipo.');
    }
    const where = and(
      eq(diagramAnswers.userId, this.userId),
      eq(diagramAnswers.assetId, assetId),
      eq(diagramAnswers.questionId, questionId),
    );
    if (answer === null) {
      await this.db.delete(diagramAnswers).where(where);
      return;
    }
    await this.db
      .insert(diagramAnswers)
      .values({ userId: this.userId, assetId, questionId, answer })
      .onConflictDoUpdate({
        target: [diagramAnswers.userId, diagramAnswers.assetId, diagramAnswers.questionId],
        set: { answer },
      });
  }

  // -------------------------------------------------------------------------
  // Questions (each type has its own list)
  // -------------------------------------------------------------------------

  private async findQuestion(id: string): Promise<DiagramQuestion> {
    const [row] = await this.db
      .select()
      .from(diagramQuestions)
      .where(and(eq(diagramQuestions.userId, this.userId), eq(diagramQuestions.id, id)));
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Essa pergunta não existe mais.');
    return toQuestion(row);
  }

  async addQuestion(input: QuestionInput): Promise<DiagramQuestion> {
    const existing = await this.listQuestions();
    checkQuota(existing.length, QUOTAS.diagramQuestions, `Dá para ter até ${QUOTAS.diagramQuestions} perguntas no Diagrama.`);
    const position = existing
      .filter((question) => question.type === input.type)
      .reduce((max, question) => Math.max(max, question.position + 1), 0);
    const id = createId();
    await this.db.insert(diagramQuestions).values({
      userId: this.userId,
      id,
      type: input.type,
      criterion: input.criterion.trim(),
      text: input.text.trim(),
      help: optionalText(input.help),
      weight: input.weight,
      position,
    });
    return this.findQuestion(id);
  }

  async updateQuestion(id: string, input: Omit<QuestionInput, 'type'>): Promise<void> {
    await this.findQuestion(id);
    await this.db
      .update(diagramQuestions)
      .set({
        criterion: input.criterion.trim(),
        text: input.text.trim(),
        help: optionalText(input.help),
        weight: input.weight,
      })
      .where(and(eq(diagramQuestions.userId, this.userId), eq(diagramQuestions.id, id)));
  }

  /** Removes a question and every answer to it (the screen asks first). */
  async deleteQuestion(id: string): Promise<void> {
    await this.db
      .delete(diagramQuestions)
      .where(and(eq(diagramQuestions.userId, this.userId), eq(diagramQuestions.id, id)));
  }

  /** The new order of one type's questions (ids of other types are ignored). */
  async reorderQuestions(type: TickerType, ids: string[]): Promise<void> {
    const own = (await this.listQuestions()).filter((question) => question.type === type);
    const known = new Set(own.map((question) => question.id));
    const ordered = [...ids.filter((id) => known.has(id)), ...own.map((q) => q.id).filter((id) => !ids.includes(id))];
    await this.db.transaction(async (tx) => {
      for (const [position, id] of ordered.entries()) {
        await tx
          .update(diagramQuestions)
          .set({ position })
          .where(and(eq(diagramQuestions.userId, this.userId), eq(diagramQuestions.id, id)));
      }
    });
  }

  /**
   * "Usar as recomendadas": copies the recommended list of `type` into this account (the copy is
   * the person's, with no link to the original). The ones already there (same criterion) are
   * skipped, so pressing it twice changes nothing.
   */
  async useRecommended(type: TickerType): Promise<number> {
    const all = await this.listQuestions();
    const own = all.filter((question) => question.type === type);
    const have = new Set(own.map((question) => question.criterion.toLowerCase()));
    const missing = RECOMMENDED_QUESTIONS[type].filter((question) => !have.has(question.criterion.toLowerCase()));
    if (missing.length === 0) return 0;
    checkQuota(
      all.length + missing.length - 1,
      QUOTAS.diagramQuestions,
      `Dá para ter até ${QUOTAS.diagramQuestions} perguntas no Diagrama.`,
    );
    const start = own.reduce((max, question) => Math.max(max, question.position + 1), 0);
    await this.db.insert(diagramQuestions).values(
      missing.map((question, index) => ({
        userId: this.userId,
        id: createId(),
        type,
        criterion: question.criterion,
        text: question.text,
        help: question.help ?? null,
        weight: 1,
        position: start + index,
      })),
    );
    return missing.length;
  }

  // -------------------------------------------------------------------------
  // Aportes
  // -------------------------------------------------------------------------

  /**
   * "Aportar" / "Aportar tudo": adds the quotas to each asset (the R$ to each fixed-income total),
   * moves their dates, keeps the aporte in the history and — when asked, with Lançamentos on —
   * launches the total as an expense in the budget's Investimentos category. All or nothing.
   */
  async contribute(input: ContributeInput): Promise<DiagramContribution> {
    const [assets, fixedIncome] = await Promise.all([this.listAssets(), this.listFixedIncome()]);
    const { quotes } = await this.readQuotes(assets);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));

    const items: DiagramContributionItem[] = [];
    for (const item of input.items) {
      if (!(item.quantity > 0)) continue;
      if (isFixedIncomeType(item.type)) {
        items.push({ type: item.type, quantity: round2(item.quantity), price: null, amount: round2(item.quantity) });
        continue;
      }
      const asset = item.assetId ? byId.get(item.assetId) : undefined;
      if (!asset || asset.type !== item.type) throw new HttpError(404, 'NOT_FOUND', 'Um dos ativos não existe mais.');
      const price = quotes[asset.id]?.price ?? null;
      if (price === null) {
        throw new HttpError(409, 'NO_QUOTE', `Sem cotação de ${asset.ticker}. Atualize as cotações antes de aportar.`);
      }
      items.push({
        type: asset.type,
        assetId: asset.id,
        ticker: asset.ticker,
        quantity: item.quantity,
        price,
        amount: round2(item.quantity * price),
      });
    }
    if (items.length === 0) throw new HttpError(400, 'EMPTY', 'Nada para aportar.');
    const amount = round2(items.reduce((sum, item) => sum + item.amount, 0));
    const contribution: DiagramContribution = { id: createId(), date: input.date, amount, items };

    const record = async (tx: Transaction, expenseId: string | null) => {
      for (const item of items) {
        if (item.assetId) {
          const asset = byId.get(item.assetId) as DiagramAsset;
          await tx
            .update(diagramAssets)
            .set({
              quantity: sql`${diagramAssets.quantity} + ${item.quantity}`,
              quantityUpdatedOn: input.date,
            })
            .where(and(eq(diagramAssets.userId, this.userId), eq(diagramAssets.id, asset.id)));
        } else {
          const type = item.type as FixedIncomeType;
          const current = fixedIncome.find((total) => total.type === type)?.amount ?? 0;
          const values = { amount: round2(current + item.amount), updatedOn: input.date };
          await tx
            .insert(diagramFixedIncome)
            .values({ userId: this.userId, type, ...values })
            .onConflictDoUpdate({ target: [diagramFixedIncome.userId, diagramFixedIncome.type], set: values });
        }
      }
      await tx.insert(diagramContributions).values({
        userId: this.userId,
        id: contribution.id,
        date: input.date,
        amount,
        items,
        expenseId,
      });
    };

    if (!input.launchExpense) {
      await this.db.transaction((tx) => record(tx, null));
      return contribution;
    }

    const settings = await this.budget.getSettings();
    if (!isModuleOn(settings, 'expenses')) {
      throw new HttpError(409, 'MODULE_OFF', 'Ligue o módulo Lançamentos para lançar o aporte em Investimentos.');
    }
    const topic = settings.topics.find((item) => item.preset === 'investimentos' && !item.archived);
    if (!topic) {
      throw new HttpError(
        409,
        'NO_INVESTMENTS_TOPIC',
        'Não encontrei a categoria Investimentos no seu orçamento. Aporte sem lançar o gasto, ou restaure as categorias padrão.',
      );
    }
    const expense: Expense = {
      id: createId(),
      categoryKind: 'topic',
      topicId: topic.id,
      description: 'Aporte (Diagrama)',
      amount,
      date: input.date,
      singleInstallmentCard: false,
      source: 'investment',
    };
    await this.budget.writeWith(async ({ tx, addExpense }) => {
      await addExpense(input.month as Month, expense);
      await record(tx, expense.id);
    });
    return contribution;
  }

  // -------------------------------------------------------------------------
  // Backup
  // -------------------------------------------------------------------------

  async exportData(): Promise<DiagramBackup> {
    const [settings, assets, fixedIncome, questions, answers, contributions] = await Promise.all([
      this.readSettings(),
      this.listAssets(),
      this.listFixedIncome(),
      this.listQuestions(),
      this.readAnswers(),
      this.listContributions(),
    ]);
    return { settings, assets, fixedIncome, questions, answers, contributions };
  }

  /** Replaces the whole Diagrama of this account with the backup's. */
  async importData(backup: DiagramBackup): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.clear(tx);
      await tx.insert(diagramSettings).values({
        userId: this.userId,
        targets: backup.settings.targets,
        lastAmount: backup.settings.lastAmount,
      });
      if (backup.assets.length > 0) {
        await tx.insert(diagramAssets).values(
          backup.assets.map((asset) => ({
            userId: this.userId,
            id: asset.id,
            type: asset.type,
            ticker: asset.ticker,
            quantity: asset.quantity,
            quantityUpdatedOn: asset.quantityUpdatedOn,
            sector: asset.sector ?? null,
            subsector: asset.subsector ?? null,
            note: asset.note ?? null,
            stopBuying: asset.stopBuying,
            isEtf: asset.isEtf,
            directScore: asset.directScore,
            position: asset.position,
          })),
        );
      }
      if (backup.fixedIncome.length > 0) {
        await tx
          .insert(diagramFixedIncome)
          .values(backup.fixedIncome.map((total) => ({ userId: this.userId, ...total })));
      }
      if (backup.questions.length > 0) {
        await tx.insert(diagramQuestions).values(
          backup.questions.map((question) => ({
            userId: this.userId,
            id: question.id,
            type: question.type,
            criterion: question.criterion,
            text: question.text,
            help: question.help ?? null,
            weight: question.weight,
            position: question.position,
          })),
        );
      }
      const assetIds = new Set(backup.assets.map((asset) => asset.id));
      const questionIds = new Set(backup.questions.map((question) => question.id));
      const answers = Object.entries(backup.answers).flatMap(([assetId, byQuestion]) =>
        Object.entries(byQuestion)
          .filter(([questionId]) => assetIds.has(assetId) && questionIds.has(questionId))
          .map(([questionId, answer]) => ({ userId: this.userId, assetId, questionId, answer })),
      );
      if (answers.length > 0) await tx.insert(diagramAnswers).values(answers);
      if (backup.contributions.length > 0) {
        await tx.insert(diagramContributions).values(
          backup.contributions.map((contribution) => ({
            userId: this.userId,
            id: contribution.id,
            date: contribution.date,
            amount: contribution.amount,
            items: contribution.items,
          })),
        );
      }
    });
  }

  /** Everything of the Diagrama of this account. */
  async clear(executor: Executor = this.db): Promise<void> {
    // Answers go with their assets and questions (cascade).
    await executor.delete(diagramContributions).where(eq(diagramContributions.userId, this.userId));
    await executor.delete(diagramAssets).where(eq(diagramAssets.userId, this.userId));
    await executor.delete(diagramQuestions).where(eq(diagramQuestions.userId, this.userId));
    await executor.delete(diagramFixedIncome).where(eq(diagramFixedIncome.userId, this.userId));
    await executor.delete(diagramSettings).where(eq(diagramSettings.userId, this.userId));
  }
}
