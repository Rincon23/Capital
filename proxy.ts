import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

// Next.js 16: the file formerly known as `middleware.ts`. Runs before every
// matched route to keep the Supabase session fresh and gate authentication.
export async function proxy(request: NextRequest) {
  return updateSession(request);
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
