import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginScreen } from '@/components/screens/LoginScreen';
import { getAuth } from '@/lib/server/auth';

export const metadata: Metadata = {
  title: 'Entrar — Capital',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A valid session (not just a leftover cookie) goes straight to the app.
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session) redirect('/');

  const { senha } = await searchParams;
  return <LoginScreen passwordReset={senha === 'redefinida'} />;
}
