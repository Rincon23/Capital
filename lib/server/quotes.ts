import 'server-only';

/**
 * Ticker prices from brapi.dev, the same source the spreadsheet used through its Apps Script.
 * The price is cached in `price_cache` (see the wallet repository), so the screens read the
 * cache and only come here when the user asks for a refresh or the quote is stale.
 */

export class QuoteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteUnavailableError';
  }
}

const BRAPI_URL = 'https://brapi.dev/api/quote';

/** Fetches the current price of `ticker`. Throws QuoteUnavailableError with a user-facing reason. */
export async function fetchQuote(ticker: string): Promise<number> {
  const token = process.env.BRAPI_TOKEN?.trim();
  if (!token) {
    throw new QuoteUnavailableError(
      'A cotação não está configurada no servidor (falta BRAPI_TOKEN no .env.local).',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${BRAPI_URL}/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new QuoteUnavailableError('Não foi possível falar com a brapi.dev. Tente de novo em instantes.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new QuoteUnavailableError('A brapi.dev recusou o token configurado no servidor.');
  }
  if (response.status === 404) {
    throw new QuoteUnavailableError(`A brapi.dev não conhece o ticker ${ticker}.`);
  }
  if (!response.ok) {
    throw new QuoteUnavailableError('A brapi.dev respondeu com erro. Tente de novo em instantes.');
  }

  const payload: unknown = await response.json().catch(() => null);
  const price = readPrice(payload);
  if (price === null) {
    throw new QuoteUnavailableError(`A brapi.dev não devolveu preço para ${ticker}.`);
  }
  return price;
}

function readPrice(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0] as { regularMarketPrice?: unknown };
  const price = first?.regularMarketPrice;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}
