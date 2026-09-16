import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { MonthClosedError, MonthNotFoundError } from '@/lib/storage/repository';
import { getAuth } from './auth';
import { PostgresBudgetRepository } from './budgetRepository';
import { getDb } from './db';
import { HttpError } from './httpError';
import { allowedOriginHosts } from './origins';
import { QuoteUnavailableError } from './quotes';
import { PostgresWalletRepository } from './walletRepository';

export { HttpError };

interface RouteArgs<P> {
  request: NextRequest;
  params: P;
  /** Budget data (months, entries, settings) for the signed-in user. */
  repo: PostgresBudgetRepository;
  /** Carteira data (recorrentes, parcelados, reserva, caixa) for the same user. */
  wallet: PostgresWalletRepository;
  /** The signed-in user's e-mail, for the owner-only routes. */
  email: string | null;
}

/**
 * Wraps a Route Handler under /api/v1: rejects cross-origin writes, requires a session,
 * hands the handler the signed-in user's repository, and turns the result into JSON
 * (`undefined` → 204) and known errors into their status codes.
 */
export function apiRoute<P = Record<string, never>>(
  handler: (args: RouteArgs<P>) => Promise<unknown>,
) {
  return async (request: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      if (!isAllowedOrigin(request)) {
        throw new HttpError(403, 'FORBIDDEN_ORIGIN', 'Origem da requisição não permitida.');
      }

      const { headers: authHeaders, response: session } = await getAuth().api.getSession({
        headers: request.headers,
        returnHeaders: true,
      });
      if (!session) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Sessão expirada. Entre novamente para continuar.');
      }

      const db = getDb();
      const repo = new PostgresBudgetRepository(db, session.user.id);
      const wallet = new PostgresWalletRepository(db, session.user.id, repo);
      const result = await handler({
        request,
        params: await context.params,
        repo,
        wallet,
        email: session.user.email ?? null,
      });

      const response =
        result === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(result);
      // Reading the session may refresh its cookie; pass that on to the browser.
      for (const cookie of authHeaders.getSetCookie()) response.headers.append('set-cookie', cookie);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Parses the JSON body with `schema`; malformed or invalid input becomes a 400. */
export async function readJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'INVALID_INPUT', 'Corpo da requisição inválido.');
  }
  return schema.parse(body);
}

/**
 * Browsers always send `Origin` on writes; it must be this host (or one of the hostnames in
 * APP_ALLOWED_ORIGINS, when behind a proxy). Requests without it (not from a browser) are
 * not a CSRF risk and still need a valid session.
 */
function isAllowedOrigin(request: NextRequest): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  return originHost === host || allowedOriginHosts().includes(originHost);
}

function jsonError(status: number, code: string, message: string): Response {
  return NextResponse.json(
    { error: message, code },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return jsonError(err.status, err.code, err.message);
  if (err instanceof ZodError) return jsonError(400, 'INVALID_INPUT', 'Dados inválidos.');
  if (err instanceof MonthClosedError) return jsonError(409, 'MONTH_CLOSED', err.message);
  if (err instanceof MonthNotFoundError) return jsonError(404, 'MONTH_NOT_FOUND', err.message);
  if (err instanceof QuoteUnavailableError) return jsonError(502, 'QUOTE_UNAVAILABLE', err.message);
  console.error('[api]', err);
  return jsonError(500, 'INTERNAL', 'Erro no servidor. Tente novamente em instantes.');
}
