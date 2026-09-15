'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { APIError } from 'better-auth/api';
import { getAuth } from '@/lib/server/auth';
import { allowAttempt } from '@/lib/server/rateLimit';

export interface AuthActionState {
  error?: string;
  /** A success that produced no session (email confirmation / password reset flows). */
  notice?: 'check-email' | 'check-email-resent' | 'reset-sent';
  /** Echoed back so the form keeps the typed address and notices can show it. */
  email?: string;
}

const MIN_PASSWORD = 8;
const FIVE_MINUTES = 5 * 60 * 1000;
const TOO_MANY_ATTEMPTS = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
/** Where the confirmation link lands once Better Auth has checked it (see app/auth/confirmado). */
const EMAIL_CONFIRMED_PATH = '/auth/confirmado';

function readCredentials(formData: FormData): { email: string; password: string } {
  return {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  };
}

/** The visitor's IP behind Cloudflare / a reverse proxy, for rate limiting. */
function clientIp(requestHeaders: Headers): string {
  return (
    requestHeaders.get('cf-connecting-ip') ??
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    requestHeaders.get('x-real-ip') ??
    'local'
  );
}

function errorCode(err: unknown): string | undefined {
  if (!(err instanceof APIError)) return undefined;
  return (err.body as { code?: string } | undefined)?.code;
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: 'Informe e-mail e senha.', email };

  const requestHeaders = await headers();
  const key = `sign-in:${clientIp(requestHeaders)}:${email.toLowerCase()}`;
  if (!allowAttempt(key, 5, FIVE_MINUTES)) return { error: TOO_MANY_ATTEMPTS, email };

  try {
    await getAuth().api.signInEmail({
      body: { email, password, rememberMe: true },
      headers: requestHeaders,
    });
  } catch (err) {
    if (errorCode(err) === 'EMAIL_NOT_VERIFIED') {
      return {
        error: 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada.',
        email,
      };
    }
    if (err instanceof APIError) return { error: 'E-mail ou senha incorretos.', email };
    console.error('[auth] falha ao entrar:', err);
    return { error: 'Não foi possível entrar agora. Tente novamente em instantes.', email };
  }

  redirect('/');
}

export async function signUp(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, password } = readCredentials(formData);
  if (!email) return { error: 'Informe um e-mail.', email };
  if (password.length < MIN_PASSWORD) {
    return { error: `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`, email };
  }
  if (!allowAttempt(`sign-up:${clientIp(await headers())}`, 5, FIVE_MINUTES)) {
    return { error: TOO_MANY_ATTEMPTS, email };
  }

  try {
    await getAuth().api.signUpEmail({
      body: { email, password, name: email.split('@')[0], callbackURL: EMAIL_CONFIRMED_PATH },
    });
  } catch (err) {
    const code = errorCode(err);
    // Don't reveal which addresses already have an account.
    if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
      return { notice: 'check-email', email };
    }
    if (err instanceof APIError) {
      return { error: 'Não foi possível criar a conta. Verifique o e-mail e a senha.', email };
    }
    console.error('[auth] falha ao criar conta:', err);
    return { error: 'Não foi possível criar a conta agora. Tente novamente em instantes.', email };
  }

  // Email confirmation is on: there is no session yet.
  return { notice: 'check-email', email };
}

export async function resendConfirmation(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Informe um e-mail.' };
  if (!allowAttempt(`resend:${email.toLowerCase()}`, 3, FIVE_MINUTES)) {
    return { error: TOO_MANY_ATTEMPTS, email };
  }

  try {
    await getAuth().api.sendVerificationEmail({
      body: { email, callbackURL: EMAIL_CONFIRMED_PATH },
    });
  } catch (err) {
    if (!(err instanceof APIError)) console.error('[auth] falha ao reenviar a confirmação:', err);
    return { error: 'Não foi possível reenviar agora. Tente mais tarde.', email };
  }
  return { notice: 'check-email-resent', email };
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Informe seu e-mail.' };

  if (allowAttempt(`reset:${email.toLowerCase()}`, 3, FIVE_MINUTES)) {
    try {
      await getAuth().api.requestPasswordReset({ body: { email, redirectTo: '/redefinir-senha' } });
    } catch (err) {
      console.error('[auth] falha ao pedir a redefinição de senha:', err);
    }
  }

  // Always report success — don't reveal which addresses have accounts.
  return { notice: 'reset-sent', email };
}

/** Sets the new password from the reset link (the token comes from /redefinir-senha?token=…). */
export async function resetPassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password.length < MIN_PASSWORD) {
    return { error: `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.` };
  }
  if (!token) return { error: 'Link inválido ou expirado. Peça um novo na tela de acesso.' };

  try {
    await getAuth().api.resetPassword({ body: { newPassword: password, token } });
  } catch (err) {
    if (!(err instanceof APIError)) console.error('[auth] falha ao redefinir a senha:', err);
    return { error: 'Não foi possível atualizar a senha. O link pode ter expirado.' };
  }

  redirect('/login?senha=redefinida');
}

export async function signOut(): Promise<void> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (err) {
    console.error('[auth] falha ao sair:', err);
  }
  redirect('/login');
}
