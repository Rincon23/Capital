import 'server-only';

/**
 * Prices of B3 assets (stocks, FIIs, ETFs, BDRs), free and without any token:
 *
 * 1. **B3** — `cotacao.b3.com.br`, the endpoint the exchange's own website uses. Official source,
 *    about 15 minutes behind, one ticker per request.
 * 2. **Yahoo Finance** — `query1.finance.yahoo.com` (ticker + ".SA"), used for whatever B3 did
 *    not answer. Accepts many tickers in one request.
 *
 * Neither is a documented API with guarantees, which is why there are two, and why the app
 * reads prices from `price_cache` and never depends on a live answer to render a screen.
 * Everything is written for many tickers at once, for the stock portfolio that comes later.
 */

export type QuoteSource = 'b3' | 'yahoo';

export interface FetchedQuote {
  /** B3 code, upper case, without ".SA" (e.g. "AUPO11"). */
  ticker: string;
  price: number;
  /** The asset's name as the source gives it, when it gives one. */
  name?: string;
  source: QuoteSource;
}

export class QuoteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteUnavailableError';
  }
}

const B3_URL = 'https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation';
const YAHOO_SPARK_URL = 'https://query1.finance.yahoo.com/v7/finance/spark';
const TIMEOUT_MS = 8_000;
/** Parallel requests to B3 (one per ticker): polite, and plenty for a personal portfolio. */
const B3_CONCURRENCY = 4;
const YAHOO_BATCH = 20;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; Capital/1.0)', Accept: 'application/json' };

/** "aupo11.sa " -> "AUPO11". */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.SA$/, '');
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.replace(/\s+/g, ' ').trim();
  return name || undefined;
}

/** Reads B3's `instrumentQuotation` answer. Null when the ticker has no quotation. */
export function parseB3Quotation(ticker: string, payload: unknown): FetchedQuote | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as {
    BizSts?: { cd?: string };
    Trad?: { scty?: { SctyQtn?: { curPrc?: unknown }; symb?: unknown; desc?: unknown } }[];
  };
  if (body.BizSts?.cd !== 'OK') return null;
  const security = body.Trad?.[0]?.scty;
  const price = security?.SctyQtn?.curPrc;
  if (!isPrice(price)) return null;
  const symbol = typeof security?.symb === 'string' ? normalizeTicker(security.symb) : ticker;
  if (symbol !== ticker) return null;
  return { ticker, price, name: cleanName(security?.desc), source: 'b3' };
}

/** Reads Yahoo's `spark` answer for many tickers. Tickers without a price are simply absent. */
export function parseYahooSpark(payload: unknown): FetchedQuote[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const results = (payload as { spark?: { result?: unknown } }).spark?.result;
  if (!Array.isArray(results)) return [];

  const quotes: FetchedQuote[] = [];
  for (const entry of results) {
    const item = entry as {
      symbol?: unknown;
      response?: { meta?: { regularMarketPrice?: unknown; longName?: unknown; shortName?: unknown } }[];
    };
    if (typeof item.symbol !== 'string') continue;
    const meta = item.response?.[0]?.meta;
    if (!isPrice(meta?.regularMarketPrice)) continue;
    quotes.push({
      ticker: normalizeTicker(item.symbol),
      price: meta.regularMarketPrice,
      name: cleanName(meta.longName) ?? cleanName(meta.shortName),
      source: 'yahoo',
    });
  }
  return quotes;
}

async function getJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fromB3(tickers: string[]): Promise<FetchedQuote[]> {
  const quotes: FetchedQuote[] = [];
  for (let i = 0; i < tickers.length; i += B3_CONCURRENCY) {
    const batch = tickers.slice(i, i + B3_CONCURRENCY);
    const answers = await Promise.all(
      batch.map(async (ticker) =>
        parseB3Quotation(ticker, await getJson(`${B3_URL}/${encodeURIComponent(ticker)}`)),
      ),
    );
    for (const quote of answers) if (quote) quotes.push(quote);
  }
  return quotes;
}

async function fromYahoo(tickers: string[]): Promise<FetchedQuote[]> {
  const quotes: FetchedQuote[] = [];
  for (let i = 0; i < tickers.length; i += YAHOO_BATCH) {
    const symbols = tickers
      .slice(i, i + YAHOO_BATCH)
      .map((ticker) => `${ticker}.SA`)
      .join(',');
    const payload = await getJson(
      `${YAHOO_SPARK_URL}?symbols=${encodeURIComponent(symbols)}&range=1d&interval=1d`,
    );
    const wanted = new Set(tickers);
    quotes.push(...parseYahooSpark(payload).filter((quote) => wanted.has(quote.ticker)));
  }
  return quotes;
}

/**
 * Current prices for `tickers`, keyed by normalized ticker. B3 first; whatever it could not
 * price goes to Yahoo. Tickers neither source knows are left out — never an exception, so one
 * bad ticker in a portfolio does not hide the prices of the others.
 */
export async function fetchQuotes(tickers: string[]): Promise<Map<string, FetchedQuote>> {
  const wanted = [...new Set(tickers.map(normalizeTicker).filter(Boolean))];
  const found = new Map<string, FetchedQuote>();

  for (const quote of await fromB3(wanted)) found.set(quote.ticker, quote);
  const missing = wanted.filter((ticker) => !found.has(ticker));
  if (missing.length > 0) {
    for (const quote of await fromYahoo(missing)) found.set(quote.ticker, quote);
  }
  return found;
}

/** The price of one ticker. Throws QuoteUnavailableError with a user-facing reason. */
export async function fetchQuote(ticker: string): Promise<FetchedQuote> {
  const normalized = normalizeTicker(ticker);
  const quote = (await fetchQuotes([normalized])).get(normalized);
  if (!quote) {
    throw new QuoteUnavailableError(
      `Não encontrei a cotação de ${normalized} na B3 nem no Yahoo Finance. Confira o código do ativo ou tente de novo em instantes.`,
    );
  }
  return quote;
}
