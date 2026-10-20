import 'server-only';
import { zonedToday } from '@/lib/reminders/time';
import { PluggyClient, pluggyApiKey, PluggyError, pluggyErrorOf, type FetchLike, type PluggyReply } from './pluggy';

/**
 * F0 of the Open Finance module: a look at what Pluggy really answers, with the person's own
 * credentials, before any screen is designed. Development only (the route refuses it elsewhere).
 *
 * It never hands back a value from the bank: no amounts, descriptions, names, documents or
 * account numbers — only which fields come filled, counts, the kinds Pluggy uses (CREDIT,
 * PIX, CREDIT_CARD…) and dates. The credentials and the apiKey stay in this request.
 */

export interface ProbeStep {
  title: string;
  /** HTTP status Pluggy answered, or null when the call never got an answer. */
  status: number | null;
  ok: boolean;
  /** Pluggy's own words when it refused (its message and code). */
  note?: string;
  data?: unknown;
}

const MEU_PLUGGY_CONNECTOR_ID = 200;

function fromReply(title: string, reply: PluggyReply, data?: unknown): ProbeStep {
  const ok = reply.status < 300;
  const error = ok ? null : pluggyErrorOf(reply);
  return {
    title,
    status: reply.status,
    ok,
    ...(error ? { note: [error.message, error.code].filter(Boolean).join(' · ') } : {}),
    ...(data === undefined ? {} : { data }),
  };
}

function failed(title: string, err: unknown): ProbeStep {
  if (err instanceof PluggyError) {
    return { title, status: err.status, ok: false, note: [err.message, err.code].filter(Boolean).join(' · ') };
  }
  return { title, status: null, ok: false, note: err instanceof Error ? err.message : String(err) };
}

/** Each step on its own: one that breaks never stops the next. */
async function step(steps: ProbeStep[], title: string, run: () => Promise<ProbeStep>): Promise<void> {
  try {
    steps.push(await run());
  } catch (err) {
    steps.push(failed(title, err));
  }
}

// ---------------------------------------------------------------------------
// What a list of objects fills, without their values
// ---------------------------------------------------------------------------

/**
 * For each field path ("paymentData.paymentMethod", "tags[]"), how many of the objects fill it,
 * as "filled/total". A field that comes as null, "" or [] counts as present but not filled.
 */
export function fieldFill(items: unknown[]): Record<string, string> {
  const filled = new Map<string, number>();
  for (const item of items) {
    const here = new Map<string, boolean>();
    walk(item, '', here);
    for (const [path, isFilled] of here) {
      filled.set(path, (filled.get(path) ?? 0) + (isFilled ? 1 : 0));
    }
  }
  return Object.fromEntries(
    [...filled].sort(([a], [b]) => a.localeCompare(b)).map(([path, n]) => [path, `${n}/${items.length}`]),
  );
}

function walk(value: unknown, path: string, here: Map<string, boolean>): void {
  const mark = (isFilled: boolean) => {
    if (path) here.set(path, here.get(path) === true || isFilled);
  };
  if (value === null || value === undefined || value === '') return mark(false);
  if (Array.isArray(value)) {
    if (value.length === 0) return mark(false);
    for (const entry of value) walk(entry, `${path}[]`, here);
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return mark(false);
    for (const [key, entry] of entries) walk(entry, path ? `${path}.${key}` : key, here);
    return;
  }
  mark(true);
}

function at(value: unknown, path: string): unknown {
  let current = value;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** How many objects have each value at `path` (only for kinds Pluggy names, never bank text). */
export function countBy(items: unknown[], path: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = at(item, path);
    const key = value === null || value === undefined || value === '' ? '(vazio)' : String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const BILL_PAYMENT = /pagamento|pgto|pag\.? ?fat|fatura|payment/i;

/** What the transactions of one account look like, without any of their values. */
export function transactionsSummary(transactions: unknown[], isCreditCard: boolean): Record<string, unknown> {
  const dates = transactions
    .map((t) => at(t, 'date'))
    .filter((d): d is string => typeof d === 'string')
    .map((d) => d.slice(0, 10))
    .sort();
  const summary: Record<string, unknown> = {
    total: transactions.length,
    firstDay: dates[0] ?? null,
    lastDay: dates[dates.length - 1] ?? null,
    type: countBy(transactions, 'type'),
    status: countBy(transactions, 'status'),
    operationType: countBy(transactions, 'operationType'),
    paymentMethod: countBy(transactions, 'paymentData.paymentMethod'),
    category: countBy(transactions, 'category'),
    fill: fieldFill(transactions),
  };
  if (isCreditCard) {
    const sign = (t: unknown) => {
      const amount = Number(at(t, 'amount'));
      return amount > 0 ? 'positivo' : amount < 0 ? 'negativo' : 'zero';
    };
    const card: Record<string, number> = {};
    for (const t of transactions) {
      const description = `${at(t, 'description') ?? ''} ${at(t, 'descriptionRaw') ?? ''}`;
      const kind = BILL_PAYMENT.test(description) ? 'parece pagamento de fatura' : 'parece compra';
      const key = `${kind} · valor ${sign(t)} · ${String(at(t, 'type') ?? '?')}`;
      card[key] = (card[key] ?? 0) + 1;
    }
    const parcelled = transactions.filter((t) => Number(at(t, 'creditCardMetadata.totalInstallments')) > 1);
    summary.card = card;
    summary.installments = {
      parceladas: parcelled.length,
      comNumeroDaParcela: parcelled.filter((t) => at(t, 'creditCardMetadata.installmentNumber') != null)
        .length,
      comDataDaCompra: parcelled.filter((t) => at(t, 'creditCardMetadata.purchaseDate') != null).length,
    };
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Items and connectors, without the person's data
// ---------------------------------------------------------------------------

function isUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

/** Where Pluggy put the address the person must open to authorize, if it did. */
export function findOauthUrl(item: unknown): { url: string; from: string } | null {
  const candidates: [string, unknown][] = [
    ['parameter.data', at(item, 'parameter.data')],
    ['parameter.oauthUrl', at(item, 'parameter.oauthUrl')],
    ['userAction.attributes.url', at(item, 'userAction.attributes.url')],
    ['oauthUrl', at(item, 'oauthUrl')],
  ];
  for (const [from, value] of candidates) if (isUrl(value)) return { url: value, from };
  const attributes = at(item, 'userAction.attributes');
  if (attributes && typeof attributes === 'object') {
    for (const [key, value] of Object.entries(attributes)) {
      if (isUrl(value)) return { url: value, from: `userAction.attributes.${key}` };
    }
  }
  return null;
}

export function itemSummary(item: unknown): Record<string, unknown> {
  const pick = (path: string) => at(item, path) ?? null;
  const parameter = at(item, 'parameter');
  const error = at(item, 'error');
  return {
    id: pick('id'),
    status: pick('status'),
    executionStatus: pick('executionStatus'),
    createdAt: pick('createdAt'),
    updatedAt: pick('updatedAt'),
    lastUpdatedAt: pick('lastUpdatedAt'),
    nextAutoSyncAt: pick('nextAutoSyncAt'),
    consentExpiresAt: pick('consentExpiresAt'),
    products: pick('products'),
    connector: {
      id: pick('connector.id'),
      name: pick('connector.name'),
      type: pick('connector.type'),
      oauth: pick('connector.oauth'),
      isOpenFinance: pick('connector.isOpenFinance'),
    },
    statusDetail: pick('statusDetail'),
    error: error ? { code: pick('error.code'), message: pick('error.message') } : null,
    parameter: parameter
      ? {
          name: pick('parameter.name'),
          type: pick('parameter.type'),
          label: pick('parameter.label'),
          dataIsUrl: isUrl(at(item, 'parameter.data')),
          expiresAt: pick('parameter.expiresAt'),
        }
      : null,
    userAction: at(item, 'userAction') ? { type: pick('userAction.type') } : null,
    oauthUrlAt: findOauthUrl(item)?.from ?? null,
    fields: item && typeof item === 'object' ? Object.keys(item).sort() : [],
  };
}

export function connectorSummary(connector: unknown): Record<string, unknown> {
  const pick = (path: string) => at(connector, path) ?? null;
  const credentials = at(connector, 'credentials');
  return {
    id: pick('id'),
    name: pick('name'),
    type: pick('type'),
    oauth: pick('oauth'),
    oauthUrl: pick('oauthUrl'),
    isOpenFinance: pick('isOpenFinance'),
    products: pick('products'),
    health: pick('health'),
    credentials: Array.isArray(credentials)
      ? credentials.map((c) => ({
          name: at(c, 'name') ?? null,
          type: at(c, 'type') ?? null,
          label: at(c, 'label') ?? null,
          optional: at(c, 'optional') ?? null,
        }))
      : null,
  };
}

/** How long the apiKey lasts, when it is a JWT that says so (minutes). */
export function apiKeyLifetimeMinutes(apiKey: string): number | null {
  const parts = apiKey.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      iat?: unknown;
      exp?: unknown;
    };
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    return Math.round((payload.exp - payload.iat) / 60);
  } catch {
    return null;
  }
}

/** "208/0001/1234567-8" → "208": the bank's code only. */
export function bankCodeOf(transferNumber: unknown): string | null {
  if (typeof transferNumber !== 'string') return null;
  const match = /^\s*(\d{3})\s*\//.exec(transferNumber);
  return match ? match[1] : null;
}

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Credentials {
  clientId: string;
  clientSecret: string;
}

async function signIn(
  steps: ProbeStep[],
  { clientId, clientSecret }: Credentials,
  fetchImpl: FetchLike,
): Promise<PluggyClient | null> {
  try {
    const apiKey = await pluggyApiKey(clientId, clientSecret, fetchImpl);
    steps.push({
      title: 'POST /auth (Client ID e Secret)',
      status: 200,
      ok: true,
      data: { apiKeyValeMinutos: apiKeyLifetimeMinutes(apiKey) },
    });
    return new PluggyClient(apiKey, fetchImpl);
  } catch (err) {
    steps.push(failed('POST /auth (Client ID e Secret)', err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// The probes
// ---------------------------------------------------------------------------

/** The credentials, the Meu Pluggy connector and what the free plan refuses. */
export async function probeCredentials(
  credentials: Credentials,
  redirectUri: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProbeStep[]> {
  const steps: ProbeStep[] = [];
  const client = await signIn(steps, credentials, fetchImpl);
  if (!client) return steps;

  await step(steps, 'GET /connectors?name=MeuPluggy', async () => {
    const reply = await client.call('GET', '/connectors?name=MeuPluggy');
    const results = (reply.body as { results?: unknown[] } | null)?.results ?? [];
    return fromReply('GET /connectors?name=MeuPluggy', reply, results.map(connectorSummary));
  });
  await step(steps, `GET /connectors/${MEU_PLUGGY_CONNECTOR_ID}`, async () => {
    const reply = await client.call('GET', `/connectors/${MEU_PLUGGY_CONNECTOR_ID}`);
    return fromReply(
      `GET /connectors/${MEU_PLUGGY_CONNECTOR_ID}`,
      reply,
      reply.status < 300 ? connectorSummary(reply.body) : undefined,
    );
  });
  await step(steps, 'GET /items (listar as conexões)', async () => {
    const reply = await client.call('GET', '/items');
    const results = (reply.body as { results?: unknown[] } | null)?.results;
    return fromReply('GET /items (listar as conexões)', reply, results ? { total: results.length } : undefined);
  });
  await step(steps, 'POST /connect_token com retorno em localhost', async () =>
    fromReply(
      'POST /connect_token com retorno em localhost',
      await client.call('POST', '/connect_token', { options: { oauthRedirectUri: 'http://localhost:3000/' } }),
    ),
  );
  await step(steps, 'POST /connect_token com retorno HTTPS', async () => {
    const reply = await client.call('POST', '/connect_token', { options: { oauthRedirectUri: redirectUri } });
    const keys = reply.body && typeof reply.body === 'object' ? Object.keys(reply.body).sort() : [];
    return fromReply('POST /connect_token com retorno HTTPS', reply, { campos: keys });
  });
  return steps;
}

/**
 * Way (a): the server creates the Meu Pluggy item and waits for the address where the person
 * authorizes it, with no Pluggy script in the page.
 */
export async function probeCreateItem(
  credentials: Credentials,
  { redirectUri, clientUserId }: { redirectUri: string; clientUserId: string },
  fetchImpl: FetchLike = fetch,
  { pollMs = 2000, pollTimes = 10 }: { pollMs?: number; pollTimes?: number } = {},
): Promise<{ steps: ProbeStep[]; itemId: string | null; oauthUrl: string | null }> {
  const steps: ProbeStep[] = [];
  const client = await signIn(steps, credentials, fetchImpl);
  if (!client) return { steps, itemId: null, oauthUrl: null };

  const attempts: [string, Record<string, unknown>][] = [
    [
      'POST /items (MeuPluggy, parameters vazio)',
      { connectorId: MEU_PLUGGY_CONNECTOR_ID, parameters: {}, oauthRedirectUri: redirectUri, clientUserId },
    ],
    [
      'POST /items (MeuPluggy, sem parameters)',
      { connectorId: MEU_PLUGGY_CONNECTOR_ID, oauthRedirectUri: redirectUri, clientUserId },
    ],
  ];
  let item: unknown = null;
  for (const [title, body] of attempts) {
    try {
      const reply = await client.call('POST', '/items', body);
      steps.push(fromReply(title, reply, reply.status < 300 ? itemSummary(reply.body) : undefined));
      if (reply.status < 300) {
        item = reply.body;
        break;
      }
    } catch (err) {
      steps.push(failed(title, err));
    }
  }
  const itemId = typeof at(item, 'id') === 'string' ? (at(item, 'id') as string) : null;
  if (!itemId) return { steps, itemId: null, oauthUrl: null };

  let oauth = findOauthUrl(item);
  for (let i = 0; !oauth && i < pollTimes; i++) {
    await sleep(pollMs);
    try {
      item = await client.get(`/items/${encodeURIComponent(itemId)}`);
      oauth = findOauthUrl(item);
    } catch (err) {
      steps.push(failed(`GET /items/{id} (espera ${i + 1})`, err));
      break;
    }
  }
  steps.push({
    title: 'Endereço para autorizar',
    status: null,
    ok: oauth !== null,
    note: oauth ? `Veio em ${oauth.from}` : 'Pluggy não mandou um endereço de autorização.',
    data: itemSummary(item),
  });
  return { steps, itemId, oauthUrl: oauth?.url ?? null };
}

/** Everything one item brings: the item, its accounts, transactions, bills and investments. */
export async function probeItem(
  credentials: Credentials,
  itemId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProbeStep[]> {
  const steps: ProbeStep[] = [];
  const client = await signIn(steps, credentials, fetchImpl);
  if (!client) return steps;
  const id = encodeURIComponent(itemId);

  await step(steps, 'GET /items/{id}', async () => {
    const reply = await client.call('GET', `/items/${id}`);
    return fromReply('GET /items/{id}', reply, reply.status < 300 ? itemSummary(reply.body) : undefined);
  });

  let accounts: unknown[] = [];
  await step(steps, 'GET /accounts?itemId=', async () => {
    const reply = await client.call('GET', `/accounts?itemId=${id}`);
    accounts = (reply.body as { results?: unknown[] } | null)?.results ?? [];
    return fromReply('GET /accounts?itemId=', reply, {
      total: accounts.length,
      // Where the bank's name can come from (the item only says "MeuPluggy"): the account's own
      // name and the bank code that starts its transfer number — never the number itself.
      accounts: accounts.map((a) => ({
        kind: `${at(a, 'type') ?? '?'} / ${at(a, 'subtype') ?? '?'}`,
        name: at(a, 'name') ?? null,
        marketingName: at(a, 'marketingName') ?? null,
        bankCode: bankCodeOf(at(a, 'bankData.transferNumber')),
        brand: at(a, 'creditData.brand') ?? null,
      })),
      fill: fieldFill(accounts),
    });
  });

  const today = zonedToday();
  const from = daysBefore(today, 365);
  for (const [index, account] of accounts.entries()) {
    const accountId = String(at(account, 'id') ?? '');
    const kind = `${at(account, 'type') ?? '?'} / ${at(account, 'subtype') ?? '?'}`;
    const isCreditCard = at(account, 'type') === 'CREDIT';
    const label = `conta ${index + 1} (${kind})`;
    await step(steps, `GET /v2/transactions — ${label}`, async () => {
      const transactions = await client.allTransactions(accountId, from, today);
      return {
        title: `GET /v2/transactions — ${label}, desde ${from}`,
        status: 200,
        ok: true,
        data: transactionsSummary(transactions, isCreditCard),
      };
    });
    if (isCreditCard) {
      await step(steps, `GET /bills — ${label}`, async () => {
        const reply = await client.call('GET', `/bills?accountId=${encodeURIComponent(accountId)}`);
        const bills = (reply.body as { results?: unknown[] } | null)?.results ?? [];
        return fromReply(`GET /bills — ${label}`, reply, {
          total: bills.length,
          dueDates: bills.map((b) => String(at(b, 'dueDate') ?? '').slice(0, 10)).sort(),
          fill: fieldFill(bills),
        });
      });
    }
  }

  const sample = accounts[0] ? encodeURIComponent(String(at(accounts[0], 'id'))) : null;
  if (sample) {
    await step(steps, 'GET /transactions (v1)', async () =>
      fromReply('GET /transactions (v1)', await client.call('GET', `/transactions?accountId=${sample}`)),
    );
    await step(steps, 'GET /v2/transactions com page e pageSize', async () =>
      fromReply(
        'GET /v2/transactions com page e pageSize',
        await client.call(
          'GET',
          `/v2/transactions?accountId=${sample}&dateFrom=${daysBefore(today, 30)}&dateTo=${today}&page=1&pageSize=20`,
        ),
      ),
    );
  }

  await step(steps, 'GET /investments?itemId=', async () => {
    const reply = await client.call('GET', `/investments?itemId=${id}`);
    const investments = (reply.body as { results?: unknown[] } | null)?.results ?? [];
    return fromReply('GET /investments?itemId=', reply, {
      total: investments.length,
      type: countBy(investments, 'type'),
      subtype: countBy(investments, 'subtype'),
      fill: fieldFill(investments),
    });
  });

  // Last: if Pluggy did accept it, all it does is start a refresh.
  await step(steps, 'PATCH /items/{id} (pedir atualização)', async () =>
    fromReply('PATCH /items/{id} (pedir atualização)', await client.call('PATCH', `/items/${id}`, {})),
  );
  return steps;
}

/** Removes a test item (Pluggy also revokes its authorization). */
export async function probeDeleteItem(
  credentials: Credentials,
  itemId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ProbeStep[]> {
  const steps: ProbeStep[] = [];
  const client = await signIn(steps, credentials, fetchImpl);
  if (!client) return steps;
  await step(steps, 'DELETE /items/{id}', async () =>
    fromReply('DELETE /items/{id}', await client.call('DELETE', `/items/${encodeURIComponent(itemId)}`)),
  );
  return steps;
}
