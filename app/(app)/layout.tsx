import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppProviders } from '@/components/providers/AppProviders';
import { LocalDataImportBanner } from '@/components/storage/LocalDataImportBanner';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Layout for every authenticated route. `proxy.ts` already redirects anonymous
 * requests to `/login`; the check here also gives us the user for `initialUser`
 * (so Client Components render without an auth loading flash).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect('/login');

  return (
    <AppProviders initialUser={{ id: claims.sub, email: claims.email ?? null }}>
      <div className="flex min-h-full flex-1 flex-col pb-16">
        <LocalDataImportBanner />
        {children}
      </div>
      <BottomNav />
    </AppProviders>
  );
}
