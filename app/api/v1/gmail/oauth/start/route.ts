import { NextResponse, type NextRequest } from 'next/server';
import { getAuth } from '@/lib/server/auth';
import { PostgresBudgetRepository } from '@/lib/server/budgetRepository';
import { getDb } from '@/lib/server/db';
import { requireGmailAccess } from '@/lib/server/gmail/access';
import {
  appBaseUrl,
  authorizationUrl,
  createOAuthState,
  googleConfig,
  OAUTH_STATE_COOKIE,
} from '@/lib/server/gmail/google';
import { HttpError } from '@/lib/server/httpError';

/**
 * "Conectar Gmail": sends the browser to Google's consent screen (read-only scope). A signed
 * cookie remembers who started it, so the callback only accepts this user's answer.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const back = (error: string) =>
    NextResponse.redirect(`${appBaseUrl()}/gmail?erro=${encodeURIComponent(error)}`, 303);
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return NextResponse.redirect(`${appBaseUrl()}/login`, 303);
    await requireGmailAccess(new PostgresBudgetRepository(getDb(), session.user.id));

    const config = googleConfig();
    if (!config) return back('O Google ainda não está configurado neste servidor.');

    const { state, cookie } = createOAuthState(session.user.id);
    const response = NextResponse.redirect(authorizationUrl(config, state, session.user.email), 303);
    response.cookies.set(OAUTH_STATE_COOKIE, cookie, {
      httpOnly: true,
      secure: appBaseUrl().startsWith('https://'),
      sameSite: 'lax',
      path: '/api/v1/gmail/oauth',
      maxAge: 10 * 60,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    if (err instanceof HttpError) return back(err.message);
    console.error('[gmail] falha ao iniciar a conexão:', err);
    return back('Não foi possível iniciar a conexão com o Google.');
  }
}
