import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppProviders } from '@/components/providers/AppProviders';
import { LocalDataImportBanner } from '@/components/storage/LocalDataImportBanner';
import { getAuth } from '@/lib/server/auth';

/**
 * Layout for every authenticated route. `proxy.ts` only checks that a session cookie exists;
 * here the session itself is validated, and the user handed to Client Components as
 * `initialUser` (so they render without an auth loading flash).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  return (
    <AppProviders initialUser={{ id: session.user.id, email: session.user.email }}>
      <div className="flex min-h-full flex-1 flex-col pb-16">
        <LocalDataImportBanner />
        {children}
      </div>
      <BottomNav />
    </AppProviders>
  );
}
