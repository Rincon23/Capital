// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fetchQuote, fetchQuotes, quoteServiceUrl, QuoteUnavailableError } from '../quotes';

const env = { QUOTES_SERVICE_TOKEN: 'segredo-de-teste-123', QUOTES_SERVICE_URL: 'http://invest:3000' } as unknown as NodeJS.ProcessEnv;

function answering(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('o serviço de cotações do Invest +', () => {
  it('pede os tickers com o segredo, pela rede interna, e devolve os preços', async () => {
    const fetchImpl = answering(200, {
      quotes: [{ ticker: 'AUPO11', price: 111.88, name: 'BTGP AUPO F11', source: 'b3', fetchedAt: '2026-11-09T18:00:00.000Z' }],
      missing: [],
    });
    const quotes = await fetchQuotes(['aupo11.sa', 'AUPO11'], fetchImpl, env);
    expect(quotes.get('AUPO11')).toEqual({
      ticker: 'AUPO11',
      price: 111.88,
      name: 'BTGP AUPO F11',
      source: 'b3',
      fetchedAt: '2026-11-09T18:00:00.000Z',
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://invest:3000/api/internal/quotes');
    expect(JSON.parse(String(init.body))).toEqual({ tickers: ['AUPO11'] });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer segredo-de-teste-123');
  });

  it('sem o segredo, ou com o Invest + fora do ar, não há preço e nada quebra', async () => {
    const neverCalled = vi.fn();
    expect((await fetchQuotes(['AUPO11'], neverCalled, {} as unknown as NodeJS.ProcessEnv)).size).toBe(0);
    expect(neverCalled).not.toHaveBeenCalled();
    expect((await fetchQuotes(['AUPO11'], answering(503, {}), env)).size).toBe(0);
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect((await fetchQuotes(['AUPO11'], down, env)).size).toBe(0);
  });

  it('um ticker sem preço vira um aviso para a tela', async () => {
    vi.stubEnv('QUOTES_SERVICE_TOKEN', 'segredo-de-teste-123');
    try {
      await expect(fetchQuote('XXXX11', answering(200, { quotes: [], missing: ['XXXX11'] }))).rejects.toBeInstanceOf(
        QuoteUnavailableError,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('usa o endereço do container do Invest + quando nada diz outro', () => {
    expect(quoteServiceUrl({} as unknown as NodeJS.ProcessEnv)).toBe('http://invest:3000');
    expect(quoteServiceUrl({ QUOTES_SERVICE_URL: 'http://localhost:3001/' } as unknown as NodeJS.ProcessEnv)).toBe(
      'http://localhost:3001',
    );
  });
});
