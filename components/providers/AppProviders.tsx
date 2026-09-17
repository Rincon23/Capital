'use client';

import type { ReactNode } from 'react';
import { TourProvider } from '@/components/modules/tour/TourProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmSheet';
import { ToastProvider } from '@/components/ui/Toast';
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
      <ToastProvider>
        <ConfirmProvider>
          <SettingsProvider>
            <TourProvider>{children}</TourProvider>
          </SettingsProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
