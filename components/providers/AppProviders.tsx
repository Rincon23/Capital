'use client';

import type { ReactNode } from 'react';
import { AuthProvider, type AuthUser } from './AuthProvider';
import { SettingsProvider } from './SettingsProvider';

/** Providers that require a signed-in user. Wraps only the authenticated routes. */
export function AppProviders({
  initialUser,
  children,
}: {
  initialUser: AuthUser;
  children: ReactNode;
}) {
  return (
    <AuthProvider initialUser={initialUser}>
      <SettingsProvider>{children}</SettingsProvider>
    </AuthProvider>
  );
}
