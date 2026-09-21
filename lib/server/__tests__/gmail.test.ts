// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GmailMessageSummary } from '@/lib/gmail';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import {
  authorizationUrl,
  createOAuthState,
  GmailAuthError,
  GmailHistoryExpiredError,
  verifyOAuthState,
  type GmailApi,
} from '../gmail/google';
import { checkGmailAccount, forgetGmailToken, runGmailJob } from '../gmail/job';
import { PostgresGmailRepository } from '../gmail/repository';
import { PostgresPushRepository, type PushSender } from '../push';
import { decryptSecret, encryptSecret } from '../secretBox';

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

beforeEach(async () => {
  // The minute job looks at every account: each test starts with only its own.
  await db.delete(schema.gmailAccounts);
  vi.stubEnv('ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('BETTER_AUTH_SECRET', 'segredo-de-teste');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const NOW = new Date('2026-09-16T15:00:05Z');

async function newOwner({ module = true, keywords = ['boleto', 'Cobrança'] } = {}) {
  const id = randomUUID();
  await db.insert(schema.user).values({ id, name: 'Dono', email: `${id}@teste.local` });
  await db.insert(schema.budgetSettings).values({
    userId: id,
    topics: [],
    specialCategories: { fixedCost: 'Custo Fixo', unforeseen: 'Imprevistos' },
    modules: { gmail: module },
  });
  await new PostgresPushRepository(db, id).registerDevice(
    { endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: 'k', auth: 'a' } },
    null,
  );
  const gmail = new PostgresGmailRepository(db, id);
  await gmail.saveAccount('dono@gmail.com', 'refresh-token-secreto', '100');
  for (const keyword of keywords) await gmail.addKeyword(keyword);
  forgetGmailToken(id);
  return { id, gmail };
}

function mail(id: string, overrides: Partial<GmailMessageSummary> = {}): GmailMessageSummary {
  return {
    id,
    subject: 'Assunto qualquer',
    from: 'Loja <loja@exemplo.com>',
    snippet: 'Olá!',
    receivedAt: '2026-09-16T14:59:00.000Z',
    labelIds: ['INBOX', 'UNREAD'],
    ...overrides,
  };
}

/** A fake Gmail with the given mailbox; `history` returns `added` since any id. */
function fakeGmail(messages: GmailMessageSummary[], options: { expired?: boolean; revoked?: boolean } = {}) {
  const calls = { token: 0, history: 0, recent: 0, message: 0 };
  const api: GmailApi = {
    accessToken: async (refreshToken) => {
      calls.token += 1;
      if (options.revoked) throw new GmailAuthError('invalid_grant');
      expect(refreshToken).toBe('refresh-token-secreto');
      return { token: 'access', expiresInSeconds: 3600 };
    },
    profile: async () => ({ email: 'dono@gmail.com', historyId: '999' }),
    history: async () => {
      calls.history += 1;
      if (options.expired) throw new GmailHistoryExpiredError();
      return { messageIds: messages.map((m) => m.id), historyId: '200' };
    },
    recentMessageIds: async () => {
      calls.recent += 1;
      return messages.map((m) => m.id);
    },
    message: async (_token, id) => {
      calls.message += 1;
      return messages.find((m) => m.id === id) ?? null;
    },
  };
  return { api, calls };
}

function recordingSender() {
  const sent: Array<Record<string, unknown>> = [];
  const sender: PushSender = async (_sub, payload) => {
    sent.push(JSON.parse(payload));
  };
  return { sender, sent };
}

describe('secretBox', () => {
  it('encrypts, decrypts and refuses tampering', () => {
    const sealed = encryptSecret('meu-token');
    expect(sealed).not.toContain('meu-token');
    expect(decryptSecret(sealed)).toBe('meu-token');
    const [version, iv, tag, data] = sealed.split('.');
    const tampered = [version, iv, tag, Buffer.from('outro').toString('base64url')].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
    expect(data).toBeTruthy();
  });

  it('stores the Gmail refresh token encrypted', async () => {
    const { id } = await newOwner();
    const [row] = await db.select().from(schema.gmailAccounts).where(eq(schema.gmailAccounts.userId, id));
    expect(row.refreshToken).not.toContain('refresh-token-secreto');
  });
});

describe('authorizationUrl', () => {
  it('always lets the user pick the Google account (it may not be the one used for Capital)', () => {
    const url = new URL(
      authorizationUrl({ clientId: 'id', clientSecret: 's', redirectUri: 'https://app/cb' }, 'estado'),
    );
    expect(url.searchParams.get('prompt')).toBe('select_account consent');
    expect(url.searchParams.has('login_hint')).toBe(false);
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
  });
});

describe('OAuth state', () => {
  it('accepts only the same user, the same state and in time', () => {
    const { state, cookie } = createOAuthState('user-1', 1_000);
    expect(verifyOAuthState(cookie, state, 'user-1', 2_000)).toBe(true);
    expect(verifyOAuthState(cookie, state, 'user-2', 2_000)).toBe(false);
    expect(verifyOAuthState(cookie, 'outro', 'user-1', 2_000)).toBe(false);
    expect(verifyOAuthState(cookie, state, 'user-1', 1_000 + 11 * 60_000)).toBe(false);
    expect(verifyOAuthState(`${cookie}x`, state, 'user-1', 2_000)).toBe(false);
    expect(verifyOAuthState(undefined, state, 'user-1', 2_000)).toBe(false);
  });
});

describe('keywords', () => {
  it('refuses the same keyword twice, whatever the case or accents', async () => {
    const { gmail } = await newOwner({ keywords: ['Cobrança'] });
    await expect(gmail.addKeyword('  cobranca ')).rejects.toMatchObject({ code: 'DUPLICATE_KEYWORD' });
    await expect(gmail.addKeyword('   ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const added = await gmail.addKeyword('  nota   fiscal ');
    expect(added.keyword).toBe('nota fiscal');
    await gmail.deleteKeyword(added.id);
    expect((await gmail.listKeywords()).map((k) => k.keyword)).toEqual(['Cobrança']);
  });
});

describe('checkGmailAccount', () => {
  it('sends one notification per e-mail with every keyword, and never the same e-mail twice', async () => {
    const { id, gmail } = await newOwner();
    const { api } = fakeGmail([
      mail('m1', { subject: 'Seu BOLETO chegou', snippet: 'Aviso de cobranca do mês' }),
      mail('m2', { subject: 'Promoção' }),
      mail('m3', { from: 'Financeiro <cobranca@empresa.com>' }),
    ]);
    const { sender, sent } = recordingSender();

    const first = await checkGmailAccount(db, id, NOW, { api, sender });
    expect(first).toEqual({ checked: 3, alerts: 2, status: 'ok' });
    expect(sent).toEqual([
      {
        title: '📩 E-mail com 2 palavras-chave',
        body: 'Loja: Seu BOLETO chegou\nPalavras: boleto, Cobrança',
        url: 'https://mail.google.com/mail/u/dono%40gmail.com/#all/m1',
        tag: 'gmail-m1',
      },
      {
        title: '📩 E-mail com "Cobrança"',
        body: 'Financeiro: Assunto qualquer',
        url: 'https://mail.google.com/mail/u/dono%40gmail.com/#all/m3',
        tag: 'gmail-m3',
      },
    ]);

    // The same e-mails again (a retry, an expired history): no new notification.
    const again = await checkGmailAccount(db, id, NOW, { api, sender });
    expect(again.alerts).toBe(0);
    expect(sent).toHaveLength(2);

    const alerts = await gmail.listAlerts('dono@gmail.com');
    expect(alerts.map((a) => [a.messageId, a.keywords, a.notifiedAt !== null])).toEqual([
      ['m1', ['boleto', 'Cobrança'], true],
      ['m3', ['Cobrança'], true],
    ]);
    const account = await gmail.getAccount();
    expect(account).toMatchObject({ status: 'ok', lastError: null, lastCheckedAt: NOW.toISOString() });
    const [row] = await db.select().from(schema.gmailAccounts).where(eq(schema.gmailAccounts.userId, id));
    expect(row.lastHistoryId).toBe('200');
  });

  it('ignores mail the user sent, drafts and spam', async () => {
    const { id } = await newOwner();
    const { api } = fakeGmail([
      mail('sent', { subject: 'boleto', labelIds: ['SENT'] }),
      mail('spam', { subject: 'boleto', labelIds: ['SPAM'] }),
      mail('draft', { subject: 'boleto', labelIds: ['DRAFT'] }),
    ]);
    const { sender, sent } = recordingSender();
    expect((await checkGmailAccount(db, id, NOW, { api, sender })).alerts).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('looks at the last day when the history id expired', async () => {
    const { id } = await newOwner();
    const { api, calls } = fakeGmail([mail('m1', { subject: 'boleto' })], { expired: true });
    const { sender, sent } = recordingSender();
    const result = await checkGmailAccount(db, id, NOW, { api, sender });
    expect(result.alerts).toBe(1);
    expect(calls.recent).toBe(1);
    expect(sent).toHaveLength(1);
    const [row] = await db.select().from(schema.gmailAccounts).where(eq(schema.gmailAccounts.userId, id));
    expect(row.lastHistoryId).toBe('999');
  });

  it('does not read messages when there are no keywords', async () => {
    const { id } = await newOwner({ keywords: [] });
    const { api, calls } = fakeGmail([mail('m1', { subject: 'boleto' })]);
    const result = await checkGmailAccount(db, id, NOW, { api, sender: recordingSender().sender });
    expect(result).toEqual({ checked: 0, alerts: 0, status: 'ok' });
    expect(calls.message).toBe(0);
  });

  it('asks to reconnect once when Google refuses the connection, and stops checking', async () => {
    const { id, gmail } = await newOwner();
    const { api, calls } = fakeGmail([], { revoked: true });
    const { sender, sent } = recordingSender();

    expect((await checkGmailAccount(db, id, NOW, { api, sender })).status).toBe('reconnect');
    expect(sent).toEqual([expect.objectContaining({ title: '📩 O monitor de Gmail parou', url: '/gmail' })]);
    expect((await gmail.getAccount())?.status).toBe('reconnect');

    // The minute job leaves it alone until the user connects again.
    await runGmailJob(db, NOW, { api, sender });
    expect(calls.token).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it('records a passing failure and tries again next time', async () => {
    const { id, gmail } = await newOwner();
    const { api } = fakeGmail([]);
    api.history = async () => {
      throw new Error('Gmail respondeu 503');
    };
    const result = await checkGmailAccount(db, id, NOW, { api, sender: recordingSender().sender });
    expect(result.status).toBe('error');
    expect(await gmail.getAccount()).toMatchObject({
      status: 'error',
      lastError: 'A última verificação falhou: Gmail respondeu 503',
    });
  });
});

describe('runGmailJob', () => {
  it('only checks accounts whose owner has the module on', async () => {
    const on = await newOwner();
    const off = await newOwner({ module: false });
    const { api } = fakeGmail([mail(`m-${randomUUID()}`, { subject: 'boleto' })]);
    const { sender } = recordingSender();

    const checked: string[] = [];
    const tracking: GmailApi = {
      ...api,
      history: async (token, start) => {
        checked.push(token);
        return api.history(token, start);
      },
    };
    await runGmailJob(db, NOW, { api: tracking, sender });
    const onRow = await on.gmail.getAccount();
    const offRow = await off.gmail.getAccount();
    expect(onRow?.lastCheckedAt).toBe(NOW.toISOString());
    expect(offRow?.lastCheckedAt).toBeNull();
    expect(checked.length).toBeGreaterThanOrEqual(1);
  });
});
