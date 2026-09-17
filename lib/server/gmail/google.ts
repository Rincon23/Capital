import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { decodeEntities, type GmailMessageSummary } from '@/lib/gmail';
import { canEncryptSecrets } from '../secretBox';

/**
 * Google's side of the Gmail monitor, with plain fetch (no SDK): the OAuth web flow with the
 * read-only scope, and the three Gmail API calls the monitor needs. Free. One Google Cloud client
 * (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) for the whole server; each user connects their own
 * Gmail through it.
 */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TIMEOUT_MS = 15_000;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** The address Google sends the user back to; it must be registered in Google Cloud. */
export function gmailRedirectUri(): string | null {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}/api/v1/gmail/oauth/callback` : null;
}

/** The app's own public URL, for redirects back into the app. */
export function appBaseUrl(): string {
  return process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, '') || 'http://localhost:3000';
}

/** Null until GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ENCRYPTION_KEY are all set. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = gmailRedirectUri();
  if (!clientId || !clientSecret || !redirectUri || !canEncryptSecrets()) return null;
  return { clientId, clientSecret, redirectUri };
}

// ---------------------------------------------------------------------------
// OAuth state: a signed, short-lived cookie ties the callback to who started it
// ---------------------------------------------------------------------------

export const OAUTH_STATE_COOKIE = 'capital-gmail-oauth';
const STATE_TTL_MS = 10 * 60_000;

function stateSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error('BETTER_AUTH_SECRET ausente.');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', stateSecret()).update(`gmail-oauth:${payload}`).digest('base64url');
}

/** A new random state and the cookie value that remembers it for this user. */
export function createOAuthState(userId: string, now = Date.now()): { state: string; cookie: string } {
  const state = randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ s: state, u: userId, e: now + STATE_TTL_MS })).toString(
    'base64url',
  );
  return { state, cookie: `${payload}.${sign(payload)}` };
}

/** Whether `state` from Google is the one this user's cookie holds, still in time. */
export function verifyOAuthState(
  cookie: string | undefined,
  state: string | null,
  userId: string,
  now = Date.now(),
): boolean {
  if (!cookie || !state) return false;
  const [payload, signature] = cookie.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      s?: string;
      u?: string;
      e?: number;
    };
    return data.s === state && data.u === userId && typeof data.e === 'number' && data.e > now;
  } catch {
    return false;
  }
}

export function authorizationUrl(config: GoogleConfig, state: string, loginHint?: string | null): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    // offline + consent: Google returns a refresh token every time, so reconnecting works.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_URL}?${params}`;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Google refused the refresh token: revoked, expired ("Testing" apps) or the client changed. */
export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailAuthError';
  }
}

/** The history id is too old for Gmail to list changes from (404). */
export class GmailHistoryExpiredError extends Error {
  constructor() {
    super('historyId expirado');
    this.name = 'GmailHistoryExpiredError';
  }
}

async function postForm(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(
  config: GoogleConfig,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
  const response = await postForm(TOKEN_URL, {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(
      `o Google recusou o código (${data.error ?? response.status}: ${data.error_description ?? ''})`,
    );
  }
  if (!data.refresh_token)
    throw new Error('o Google não devolveu o token de acesso contínuo (refresh token).');
  return { accessToken: data.access_token, refreshToken: data.refresh_token, scope: data.scope ?? '' };
}

// ---------------------------------------------------------------------------
// Gmail API
// ---------------------------------------------------------------------------

/** What the monitor needs from Gmail. Tests use a fake. */
export interface GmailApi {
  /** A fresh access token (about an hour long) from the stored refresh token. */
  accessToken(refreshToken: string): Promise<{ token: string; expiresInSeconds: number }>;
  profile(accessToken: string): Promise<{ email: string; historyId: string }>;
  /** Ids of messages added since `startHistoryId`, and the history id to start from next time. */
  history(accessToken: string, startHistoryId: string): Promise<{ messageIds: string[]; historyId: string }>;
  /** The latest messages (last day), for when the history id expired. */
  recentMessageIds(accessToken: string): Promise<string[]>;
  /** Subject, From and preview of one message; null when it no longer exists. */
  message(accessToken: string, id: string): Promise<GmailMessageSummary | null>;
}

async function gmailGet<T>(accessToken: string, path: string): Promise<{ status: number; data: T | null }> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => null)) as T | null;
  if (response.status === 401) throw new GmailAuthError('o Google recusou o token de acesso.');
  if (!response.ok && response.status !== 404) {
    const message = (data as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Gmail respondeu ${response.status}${message ? `: ${message}` : ''}`);
  }
  return { status: response.status, data };
}

export function googleGmailApi(config: GoogleConfig): GmailApi {
  return {
    async accessToken(refreshToken) {
      const response = await postForm(TOKEN_URL, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      const data = (await response.json().catch(() => ({}))) as TokenResponse;
      if (
        data.error === 'invalid_grant' ||
        data.error === 'unauthorized_client' ||
        data.error === 'invalid_client'
      ) {
        throw new GmailAuthError(`o Google recusou a conexão (${data.error}).`);
      }
      if (!response.ok || !data.access_token) {
        throw new Error(`falha ao renovar o acesso (${data.error ?? response.status})`);
      }
      return { token: data.access_token, expiresInSeconds: data.expires_in ?? 3600 };
    },

    async profile(accessToken) {
      const { data } = await gmailGet<{ emailAddress: string; historyId: string }>(accessToken, '/profile');
      if (!data?.emailAddress) throw new Error('Gmail não devolveu o perfil.');
      return { email: data.emailAddress, historyId: String(data.historyId) };
    },

    async history(accessToken, startHistoryId) {
      const ids = new Set<string>();
      let pageToken: string | undefined;
      let historyId = startHistoryId;
      for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({
          startHistoryId,
          historyTypes: 'messageAdded',
          maxResults: '100',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const { status, data } = await gmailGet<{
          history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>;
          nextPageToken?: string;
          historyId?: string;
        }>(accessToken, `/history?${params}`);
        if (status === 404) throw new GmailHistoryExpiredError();
        for (const entry of data?.history ?? []) {
          for (const added of entry.messagesAdded ?? []) if (added.message?.id) ids.add(added.message.id);
        }
        if (data?.historyId) historyId = String(data.historyId);
        pageToken = data?.nextPageToken;
        if (!pageToken) break;
      }
      return { messageIds: [...ids], historyId };
    },

    async recentMessageIds(accessToken) {
      const params = new URLSearchParams({ q: 'newer_than:1d', maxResults: '20' });
      const { data } = await gmailGet<{ messages?: Array<{ id: string }> }>(
        accessToken,
        `/messages?${params}`,
      );
      return (data?.messages ?? []).map((m) => m.id);
    },

    async message(accessToken, id) {
      const params = new URLSearchParams({ format: 'metadata' });
      params.append('metadataHeaders', 'Subject');
      params.append('metadataHeaders', 'From');
      const { status, data } = await gmailGet<{
        id: string;
        snippet?: string;
        internalDate?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }> };
      }>(accessToken, `/messages/${encodeURIComponent(id)}?${params}`);
      if (status === 404 || !data) return null;
      const header = (name: string) =>
        data.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
      const received = Number(data.internalDate);
      return {
        id: data.id,
        subject: header('Subject'),
        from: header('From'),
        snippet: decodeEntities(data.snippet ?? ''),
        receivedAt: new Date(Number.isFinite(received) ? received : Date.now()).toISOString(),
        labelIds: data.labelIds ?? [],
      };
    },
  };
}
