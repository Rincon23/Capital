// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { nextPagePath, PluggyClient, pluggyApiKey, PluggyError, type FetchLike } from '../banks/pluggy';
import {
  apiKeyLifetimeMinutes,
  bankCodeOf,
  fieldFill,
  findOauthUrl,
  probeCreateItem,
  probeCredentials,
  transactionsSummary,
} from '../banks/probe';

/** A fake Pluggy: answers by method and path (query included), and records what it was asked. */
function fakePluggy(routes: Record<string, { status?: number; body: unknown } | (() => { status?: number; body: unknown })>) {
  const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const path = url.replace('https://api.pluggy.ai', '');
    const route = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
    const answer = typeof route === 'function' ? route() : route;
    if (!answer) return new Response(JSON.stringify({ message: 'not found', code: 404 }), { status: 404 });
    return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
  }) as unknown as FetchLike;
  return { fetchImpl, calls };
}

const jwt = (payload: object) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

describe('pluggyApiKey', () => {
  it('trades the Client ID and Secret for the apiKey', async () => {
    const { fetchImpl, calls } = fakePluggy({ 'POST /auth': { body: { apiKey: 'chave' } } });
    await expect(pluggyApiKey('id', 'segredo', fetchImpl)).resolves.toBe('chave');
    expect(calls[0].body).toEqual({ clientId: 'id', clientSecret: 'segredo' });
  });

  it("turns a refusal into Pluggy's own message and code", async () => {
    const { fetchImpl } = fakePluggy({
      'POST /auth': {
        status: 401,
        body: { code: 401, message: 'Invalid credentials', codeDescription: 'INVALID_CREDENTIALS' },
      },
    });
    const error = await pluggyApiKey('id', 'errado', fetchImpl).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(PluggyError);
    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
  });
});

describe('PluggyClient.allTransactions', () => {
  it('follows next until it comes back empty, sending the apiKey', async () => {
    const { fetchImpl, calls } = fakePluggy({
      'GET /v2/transactions?accountId=a1&dateFrom=2026-10-01&dateTo=2026-10-20': {
        body: {
          results: [{ id: 't1' }],
          next: 'https://api.pluggy.ai/v2/transactions?accountId=a1&dateFrom=2026-10-01&dateTo=2026-10-20&after=c1',
        },
      },
      'GET /v2/transactions?after=c2&accountId=a1&dateFrom=2026-10-01&dateTo=2026-10-20': {
        body: { results: [{ id: 't3' }], next: null },
      },
      'GET /v2/transactions?accountId=a1&dateFrom=2026-10-01&dateTo=2026-10-20&after=c1': {
        // A bare query string, without the account and the days: they go back in.
        body: { results: [{ id: 't2' }], next: 'after=c2' },
      },
    });
    const client = new PluggyClient('chave', fetchImpl);
    const all = await client.allTransactions('a1', '2026-10-01', '2026-10-20');
    expect(all).toEqual([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);
    expect(calls.every((call) => call.headers['X-API-KEY'] === 'chave')).toBe(true);
  });

  it('never follows a next that points outside Pluggy', () => {
    const first = new URLSearchParams({ accountId: 'a1' });
    expect(nextPagePath('https://evil.example/v2/transactions?after=x', first)).toBeNull();
    expect(nextPagePath('/v2/transactions?after=x', first)).toBe('/v2/transactions?after=x&accountId=a1');
  });
});

describe('what the probe hands back', () => {
  const transactions = [
    {
      id: '1',
      description: 'IFOOD *RESTAURANTE',
      descriptionRaw: null,
      amount: 45.9,
      date: '2026-10-18T03:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      category: 'Food delivery',
      paymentData: null,
      merchant: { name: 'IFOOD', cnpj: '00000000000000' },
      creditCardMetadata: { totalInstallments: 3, purchaseDate: '2026-08-18T03:00:00.000Z' },
    },
    {
      id: '2',
      description: 'PAGAMENTO RECEBIDO',
      descriptionRaw: '',
      amount: -1200,
      date: '2026-10-10T03:00:00.000Z',
      type: 'CREDIT',
      status: 'PENDING',
      category: null,
      paymentData: null,
      merchant: null,
      creditCardMetadata: null,
    },
  ];

  it('counts which fields come filled, without their values', () => {
    const fill = fieldFill(transactions);
    expect(fill['descriptionRaw']).toBe('0/2');
    expect(fill['merchant.name']).toBe('1/2');
    expect(fill['creditCardMetadata.totalInstallments']).toBe('1/2');
    expect(fill['amount']).toBe('2/2');
    expect(JSON.stringify(fill)).not.toContain('IFOOD');
  });

  it('shows the card signs and the installments that came without their number', () => {
    const summary = transactionsSummary(transactions, true);
    expect(summary.card).toEqual({
      'parece compra · valor positivo · DEBIT': 1,
      'parece pagamento de fatura · valor negativo · CREDIT': 1,
    });
    expect(summary.installments).toEqual({ parceladas: 1, comNumeroDaParcela: 0, comDataDaCompra: 1 });
    expect(summary.firstDay).toBe('2026-10-10');
    expect(summary.status).toEqual({ POSTED: 1, PENDING: 1 });
    const text = JSON.stringify(summary);
    expect(text).not.toContain('45.9');
    expect(text).not.toContain('PAGAMENTO RECEBIDO');
  });

  it('keeps only the bank code of a transfer number', () => {
    expect(bankCodeOf('208/0001/1234567-8')).toBe('208');
    expect(bankCodeOf('1234567-8')).toBeNull();
    expect(bankCodeOf(null)).toBeNull();
  });

  it('reads how long the apiKey lasts when it is a JWT', () => {
    expect(apiKeyLifetimeMinutes(jwt({ iat: 1000, exp: 1000 + 7200 }))).toBe(120);
    expect(apiKeyLifetimeMinutes('opaca')).toBeNull();
  });

  it('finds the authorization address wherever Pluggy put it', () => {
    expect(findOauthUrl({ parameter: { data: 'https://meu.pluggy.ai/oauth?x=1' } })).toEqual({
      url: 'https://meu.pluggy.ai/oauth?x=1',
      from: 'parameter.data',
    });
    expect(findOauthUrl({ userAction: { attributes: { link: 'https://meu.pluggy.ai/a' } } })?.from).toBe(
      'userAction.attributes.link',
    );
    expect(findOauthUrl({ parameter: { data: 'iVBORw0KGgo=' } })).toBeNull();
  });
});

describe('the probes', () => {
  it('report every step, even after one is refused, and never the apiKey', async () => {
    const { fetchImpl } = fakePluggy({
      'POST /auth': { body: { apiKey: 'chave-secreta' } },
      'GET /connectors': { body: { results: [{ id: 200, name: 'MeuPluggy', oauth: true, credentials: [] }] } },
      'GET /connectors/200': { body: { id: 200, name: 'MeuPluggy', oauth: true } },
      'GET /items': {
        status: 403,
        body: { code: 403, message: 'List items not enabled', codeDescription: 'LIST_ITEMS_FEATURE_NOT_ENABLED' },
      },
      'POST /connect_token': { body: { accessToken: 'token-de-30-min' } },
    });
    const steps = await probeCredentials({ clientId: 'id', clientSecret: 's' }, 'https://x.example/', fetchImpl);
    expect(steps.map((s) => s.ok)).toEqual([true, true, true, false, true, true]);
    expect(steps[3].note).toBe('List items not enabled · LIST_ITEMS_FEATURE_NOT_ENABLED');
    const text = JSON.stringify(steps);
    expect(text).not.toContain('chave-secreta');
    expect(text).not.toContain('token-de-30-min');
  });

  it('creates the Meu Pluggy item and waits for the address to authorize', async () => {
    let reads = 0;
    const { fetchImpl, calls } = fakePluggy({
      'POST /auth': { body: { apiKey: 'chave' } },
      'POST /items': {
        body: { id: '6f1c2c3e-0000-4000-8000-000000000001', status: 'UPDATING', executionStatus: 'CREATED' },
      },
      'GET /items/6f1c2c3e-0000-4000-8000-000000000001': () => {
        reads += 1;
        return {
          body: {
            id: '6f1c2c3e-0000-4000-8000-000000000001',
            status: 'WAITING_USER_INPUT',
            parameter: reads > 1 ? { name: 'oauth_code', type: 'oauth', data: 'https://meu.pluggy.ai/x' } : null,
          },
        };
      },
    });
    const result = await probeCreateItem(
      { clientId: 'id', clientSecret: 's' },
      { redirectUri: 'https://x.example/', clientUserId: 'u1' },
      fetchImpl,
      { pollMs: 1, pollTimes: 5 },
    );
    expect(result.itemId).toBe('6f1c2c3e-0000-4000-8000-000000000001');
    expect(result.oauthUrl).toBe('https://meu.pluggy.ai/x');
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/items'))?.body).toMatchObject({
      connectorId: 200,
      oauthRedirectUri: 'https://x.example/',
      clientUserId: 'u1',
    });
  });
});
