'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { signOut as signOutAction } from '@/lib/auth/actions';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export interface AuthUser {
  id: string;
  email: string | null;
}

interface AuthContextValue {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the signed-in user for Client Components. Seeded from the server
 * (`initialUser`, resolved by the authenticated layout) so there is no loading
 * flash, then kept in sync via Supabase's `onAuthStateChange` — a sign-out in
 * another tab, or an expired session, sends the user back to `/login`.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: AuthUser;
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser>(initialUser);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/login');
        return;
      }
      setUser({ id: session.user.id, email: session.user.email ?? null });
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  const signOut = useCallback(async () => {
    await signOutAction();
  }, []);

  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
