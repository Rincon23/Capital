import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Target of the links in Supabase's confirmation and password-recovery emails.
 * Handles both flows:
 *   - `?code=...`                 (default template / PKCE) -> exchangeCodeForSession
 *   - `?token_hash=...&type=...`  (custom template)         -> verifyOtp
 * Either sets the session cookie, then we forward to `next` (a same-origin path).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'));

  const supabase = await getSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL('/auth/auth-code-error', request.url));
}

/** Only allow same-origin absolute paths as the post-confirmation destination. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
