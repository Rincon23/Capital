'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface AuthActionState {
  error?: string;
  /** A success that produced no session (email confirmation / password reset flows). */
  notice?: 'check-email' | 'check-email-resent' | 'reset-sent';
  /** Echoed back so the form keeps the typed address and notices can show it. */
  email?: string;
}

const MIN_PASSWORD = 8;

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

function readCredentials(formData: FormData): { email: string; password: string } {
  return {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  };
}

export async function signIn(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: 'Informe e-mail e senha.', email };

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return {
        error: 'Confirme seu e-mail antes de entrar — verifique sua caixa de entrada.',
        email,
      };
    }
    return { error: 'E-mail ou senha incorretos.', email };
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

  const supabase = await getSupabaseServerClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=%2F` },
  });

  if (error) {
    if (error.code === 'over_email_send_rate_limit') {
      return { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', email };
    }
    return { error: 'Não foi possível criar a conta. Verifique o e-mail e a senha.', email };
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

  const supabase = await getSupabaseServerClient();
  const origin = await siteOrigin();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=%2F` },
  });

  if (error) return { error: 'Não foi possível reenviar agora. Tente mais tarde.', email };
  return { notice: 'check-email-resent', email };
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Informe seu e-mail.' };

  const supabase = await getSupabaseServerClient();
  const origin = await siteOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=%2Fredefinir-senha`,
  });

  // Always report success — don't reveal which addresses have accounts.
  return { notice: 'reset-sent', email };
}

export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get('password') ?? '');
  if (password.length < MIN_PASSWORD) {
    return { error: `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.` };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: 'Não foi possível atualizar a senha. O link pode ter expirado.' };
  }

  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
