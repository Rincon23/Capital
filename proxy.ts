import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Next.js 16: the file formerly known as `middleware.ts`. An optimistic gate only: it checks
// that a session cookie exists. Whether the session is actually valid is checked by the
// authenticated layout (pages) and by every /api/v1 route.

/**
 * Path prefixes reachable without a session. The notification actions carry their own signed
 * token instead (lib/server/reminderActionToken.ts).
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  '/redefinir-senha',
  // The privacy policy linked from Google's consent screen.
  '/privacidade',
  '/api/auth',
  '/api/v1/reminders/actions',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname) || getSessionCookie(request)) return NextResponse.next();

  // The API answers in JSON; the HTTP repository turns this into "go to /login".
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Sessão expirada. Entre novamente para continuar.', code: 'UNAUTHENTICATED' },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Every request path except:
     * - _next/static, _next/image (build assets)
     * - PWA / metadata files served as-is (manifest, service worker, offline page, icons)
     * - any image file
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)',
  ],
};
