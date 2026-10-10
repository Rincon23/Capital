import 'server-only';
import { DOLLAR_CACHE_KEY, looksLikeEtf, priceCacheKey } from '../diagram/tickers';
import type { QuoteMarket } from '../diagram/types';

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
  const wanted = new Set(tickers);
  return (await fromYahooSymbols(tickers.map((ticker) => `${ticker}.SA`))).filter((quote) =>
    wanted.has(quote.ticker),
  );
}

/** Yahoo's spark for these exact symbols ("VOO", "BTC-BRL", "USDBRL=X"), many per request. */
async function fromYahooSymbols(symbols: string[]): Promise<FetchedQuote[]> {
  const quotes: FetchedQuote[] = [];
  for (let i = 0; i < symbols.length; i += YAHOO_BATCH) {
    const batch = symbols.slice(i, i + YAHOO_BATCH).join(',');
    const payload = await getJson(`${YAHOO_SPARK_URL}?symbols=${encodeURIComponent(batch)}&range=1d&interval=1d`);
    quotes.push(...parseYahooSpark(payload));
  }
  return quotes;
}

// ---------------------------------------------------------------------------
// The Diagrama's other markets: US stocks, ETFs and REITs (Yahoo, in US$), crypto (Yahoo, already
// in R$) and the dollar. Same rule as above: free, no token, never an exception.
// ---------------------------------------------------------------------------

/** What the Diagrama asks for: a ticker and the market that prices it. */
export interface MarketRequest {
  market: QuoteMarket;
  /** As the app keeps it (lib/diagram/tickers.ts): "PETR4", "VOO", "BTC". */
  ticker: string;
}

/** The symbol Yahoo knows a ticker by, outside B3. */
function yahooSymbol({ market, ticker }: MarketRequest): string {
  return market === 'crypto' ? `${ticker}-BRL` : ticker;
}

/** The dollar in R$, as Yahoo calls it. */
export const DOLLAR_SYMBOL = 'USDBRL=X';

/**
 * Prices for the Diagrama, keyed by `priceCacheKey`, in the asset's own currency (US$ for the
 * `us` market — the caller converts with the dollar, which comes along under `DOLLAR_CACHE_KEY`
 * whenever any `us` ticker was asked for). Whatever no source knows is left out.
 */
export async function fetchMarketQuotes(requests: MarketRequest[]): Promise<Map<string, FetchedQuote>> {
  const found = new Map<string, FetchedQuote>();
  const b3 = requests.filter((request) => request.market === 'b3').map((request) => request.ticker);
  const others = requests.filter((request) => request.market !== 'b3');

  if (b3.length > 0) {
    for (const [ticker, quote] of await fetchQuotes(b3)) found.set(priceCacheKey('b3', ticker), quote);
  }

  const bySymbol = new Map<string, string>();
  for (const request of others) bySymbol.set(yahooSymbol(request), priceCacheKey(request.market, request.ticker));
  if (others.some((request) => request.market === 'us')) bySymbol.set(DOLLAR_SYMBOL, DOLLAR_CACHE_KEY);
  if (bySymbol.size > 0) {
    for (const quote of await fromYahooSymbols([...bySymbol.keys()])) {
      const key = bySymbol.get(quote.ticker);
      if (key) found.set(key, { ...quote, ticker: key });
    }
  }
  return found;
}

/** One suggestion while the person types a ticker. */
export interface TickerSuggestion {
  ticker: string;
  name?: string;
  /** Whether the source says (or the name shows) it is an ETF. */
  isEtf: boolean;
}

const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
/** The US exchanges as Yahoo names them (NYSE, Nasdaq, NYSE Arca, NYSE American, Cboe, OTC). */
const US_EXCHANGES = new Set(['NYQ', 'NYS', 'NMS', 'NGM', 'NCM', 'NAS', 'PCX', 'ASE', 'BTS', 'PNK']);
/** A B3 code in the regular market: four letters and the share-class digits (no "F" or "Q"). */
const B3_SYMBOL = /^([A-Z0-9]{4}\d{1,2})\.SA$/;
const MAX_SUGGESTIONS = 8;

/** Reads Yahoo's search answer, keeping only what the market can price, at most 8. */
export function parseYahooSearch(market: QuoteMarket, payload: unknown): TickerSuggestion[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const quotes = (payload as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];

  const suggestions = new Map<string, TickerSuggestion>();
  for (const entry of quotes) {
    const item = entry as {
      symbol?: unknown;
      quoteType?: unknown;
      exchange?: unknown;
      shortname?: unknown;
      longname?: unknown;
    };
    if (typeof item.symbol !== 'string') continue;
    const kind = typeof item.quoteType === 'string' ? item.quoteType.toUpperCase() : '';
    const name = cleanName(item.longname) ?? cleanName(item.shortname);
    let ticker: string | null = null;

    if (market === 'b3') {
      const match = B3_SYMBOL.exec(item.symbol.toUpperCase());
      if (match && (kind === 'EQUITY' || kind === 'ETF')) ticker = match[1];
    } else if (market === 'us') {
      const exchange = typeof item.exchange === 'string' ? item.exchange : '';
      if ((kind === 'EQUITY' || kind === 'ETF') && US_EXCHANGES.has(exchange) && /^[A-Z][A-Z0-9.-]*$/.test(item.symbol))
        ticker = item.symbol;
    } else if (kind === 'CRYPTOCURRENCY') {
      const match = /^([A-Z0-9]+)-(USD|BRL)$/.exec(item.symbol.toUpperCase());
      if (match) ticker = match[1];
    }

    if (ticker && !suggestions.has(ticker)) {
      suggestions.set(ticker, {
        ticker,
        name: market === 'crypto' ? name?.replace(/\s+(USD|BRL)$/i, '') : name,
        isEtf: looksLikeEtf(name, kind),
      });
    }
    if (suggestions.size >= MAX_SUGGESTIONS) break;
  }
  return [...suggestions.values()];
}

/**
 * Tickers that start like `query`, from Yahoo's search (free, no token), for these markets in this
 * order (the type's own market first). Empty when it fails.
 */
export async function searchTickers(markets: QuoteMarket[], query: string): Promise<TickerSuggestion[]> {
  const text = query.trim();
  if (!text) return [];
  const params = new URLSearchParams({ q: text, quotesCount: '15', newsCount: '0', listsCount: '0' });
  const payload = await getJson(`${YAHOO_SEARCH_URL}?${params.toString()}`);
  const seen = new Set<string>();
  const suggestions: TickerSuggestion[] = [];
  for (const market of markets) {
    for (const suggestion of parseYahooSearch(market, payload)) {
      if (seen.has(suggestion.ticker)) continue;
      seen.add(suggestion.ticker);
      suggestions.push(suggestion);
    }
  }
  return suggestions.slice(0, MAX_SUGGESTIONS);
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
