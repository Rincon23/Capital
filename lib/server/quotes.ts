import 'server-only';

/**
 * The price of the Reserva investida's ticker, asked to the Invest + — the one quote service of the
 * Orange Pi (since 2026-11-09, when the Diagrama moved there). The Capital + no longer talks to B3
 * or Yahoo itself: the Invest + answers from its cache and only fetches what is old, so a ticker
 * both apps hold is never fetched twice.
 *
 * Reached inside the Docker network (QUOTES_SERVICE_URL, `http://invest:3000` by default) with the
 * secret both apps share (QUOTES_SERVICE_TOKEN). When it doesn't answer, the screens keep showing
 * the last price in `price_cache`.
 */

export type QuoteSource = 'b3' | 'yahoo';

export interface FetchedQuote {
  /** B3 code, upper case, without ".SA" (e.g. "AUPO11"). */
  ticker: string;
  price: number;
  /** The asset's name as the source gives it, when it gives one. */
  name?: string;
  source: QuoteSource;
  /** When the price was fetched from the source (it may be a few minutes old, from the cache). */
  fetchedAt?: string;
}

export class QuoteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteUnavailableError';
  }
}

const TIMEOUT_MS = 15_000;

/** "aupo11.sa " -> "AUPO11". */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\.SA$/, '');
}

export function quoteServiceUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.QUOTES_SERVICE_URL?.trim() || 'http://invest:3000').replace(/\/+$/, '');
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface ServiceAnswer {
  quotes?: { ticker: string; price: number; name?: string; source?: QuoteSource; fetchedAt?: string }[];
}

/**
 * Current prices for `tickers`, keyed by normalized ticker. Tickers the service doesn't know, and
 * every ticker when it doesn't answer, are left out — never an exception.
 */
export async function fetchQuotes(
  tickers: string[],
  fetchImpl: FetchLike = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Map<string, FetchedQuote>> {
  const wanted = [...new Set(tickers.map(normalizeTicker).filter(Boolean))];
  const found = new Map<string, FetchedQuote>();
  const token = env.QUOTES_SERVICE_TOKEN?.trim();
  if (wanted.length === 0 || !token) return found;
  try {
    const response = await fetchImpl(`${quoteServiceUrl(env)}/api/internal/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tickers: wanted.slice(0, 50) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) return found;
    const answer = (await response.json()) as ServiceAnswer;
    for (const quote of answer.quotes ?? []) {
      if (!(typeof quote.price === 'number' && Number.isFinite(quote.price) && quote.price > 0)) continue;
      const ticker = normalizeTicker(quote.ticker);
      found.set(ticker, {
        ticker,
        price: quote.price,
        ...(quote.name ? { name: quote.name } : {}),
        source: quote.source === 'b3' ? 'b3' : 'yahoo',
        ...(quote.fetchedAt ? { fetchedAt: quote.fetchedAt } : {}),
      });
    }
  } catch {
    // The Invest + is away (restarting, rebuilding): the last cached price stays on screen.
  }
  return found;
}

/** The price of one ticker. Throws QuoteUnavailableError with a user-facing reason. */
export async function fetchQuote(ticker: string, fetchImpl: FetchLike = fetch): Promise<FetchedQuote> {
  const normalized = normalizeTicker(ticker);
  const quote = (await fetchQuotes([normalized], fetchImpl)).get(normalized);
  if (!quote) {
    throw new QuoteUnavailableError(
      `Não consegui a cotação de ${normalized} agora. Confira o código do ativo ou tente de novo em instantes.`,
    );
  }
  return quote;
}
