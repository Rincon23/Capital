import { NextResponse, type NextRequest } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { PostgresBudgetRepository } from '@/lib/server/budgetRepository';
import { getDb } from '@/lib/server/db';
import { requireGmailAccess } from '@/lib/server/gmail/access';
import {
  appBaseUrl,
  exchangeCode,
  GMAIL_SCOPE,
  googleConfig,
  googleGmailApi,
  OAUTH_STATE_COOKIE,
  verifyOAuthState,
} from '@/lib/server/gmail/google';
import { forgetGmailToken } from '@/lib/server/gmail/job';
import { PostgresGmailRepository } from '@/lib/server/gmail/repository';
import { HttpError } from '@/lib/server/httpError';

/**
 * Where Google sends the browser back. Checks the state against the cookie, trades the code for
 * a refresh token, stores it encrypted and starts watching from the mailbox's current point, so
 * mail that was already there never triggers an alert.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const finish = (query: string) => {
    const response = NextResponse.redirect(`${appBaseUrl()}/gmail?${query}`, 303);
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: '/api/v1/gmail/oauth' });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  const fail = (message: string) => finish(`erro=${encodeURIComponent(message)}`);

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.redirect(`${appBaseUrl()}/login`, 303);
    const db = getDb();
    await requireGmailAccess(new PostgresBudgetRepository(db, session.user.id));

    const params = request.nextUrl.searchParams;
    const cookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!verifyOAuthState(cookie, params.get('state'), session.user.id)) {
      return fail('A conexão expirou ou veio de outro lugar. Toque em "Conectar Gmail" de novo.');
    }
    if (params.get('error')) {
      return fail(
        params.get('error') === 'access_denied'
          ? 'Você não deu a permissão no Google. Nada foi conectado.'
          : `O Google não concluiu a conexão (${params.get('error')}).`,
      );
    }
    const code = params.get('code');
    const config = googleConfig();
    if (!code || !config) return fail('O Google não devolveu a autorização.');

    const tokens = await exchangeCode(config, code);
    if (!tokens.scope.split(' ').includes(GMAIL_SCOPE)) {
      return fail('A permissão de ler os e-mails ficou desmarcada no Google. Conecte de novo e marque-a.');
    }
    const profile = await googleGmailApi(config).profile(tokens.accessToken);
    await new PostgresGmailRepository(db, session.user.id).saveAccount(
      profile.email,
      tokens.refreshToken,
      profile.historyId,
    );
    forgetGmailToken(session.user.id);
    return finish('conectado=1');
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message);
    console.error('[gmail] falha ao concluir a conexão:', err);
    return fail('Não foi possível concluir a conexão com o Google. Tente de novo.');
  }
}
