'use client';

import { useState } from 'react';
import { Bell, CheckCheck, Clock, Mail, Settings as SettingsIcon, Sparkles, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useNotifications } from '@/components/notifications/NotificationsProvider';
import { NotificationPreferencesSection } from '@/components/settings/NotificationPreferencesSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { NOTIFICATION_CATEGORY_LABELS, type AppNotification, type NotificationCategory } from '@/lib/notifications';

const CATEGORY_VISUAL: Record<NotificationCategory, { icon: LucideIcon; tone: IconTone }> = {
  reminder: { icon: Clock, tone: 'amber' },
  gmail: { icon: Mail, tone: 'red' },
  feature: { icon: Sparkles, tone: 'purple' },
  system: { icon: Bell, tone: 'neutral' },
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}

/** Central de notificações: everything the app has ever told this account, most recent first. */
export function NotificationsScreen() {
  const { snapshot, loading, markRead, markAllRead } = useNotifications();
  const [configuring, setConfiguring] = useState(false);

  const items = snapshot?.notifications ?? [];
  const unread = snapshot?.unread ?? 0;

  async function open(item: AppNotification) {
    if (!item.readAt) await markRead(item.id);
    if (item.href) window.location.href = item.href;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader
        title="Notificações"
        subtitle={unread > 0 ? `${unread} não ${unread === 1 ? 'lida' : 'lidas'}` : undefined}
        action={
          <>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                aria-label="Marcar todas como lidas"
                title="Marcar todas como lidas"
                className="text-muted hover:text-foreground hover:bg-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
              >
                <CheckCheck aria-hidden className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfiguring(true)}
              aria-label="Configurações de notificações"
              title="Configurações"
              className="text-muted hover:text-foreground hover:bg-card flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
            >
              <SettingsIcon aria-hidden className="h-5 w-5" />
            </button>
          </>
        }
      />

      {loading && !snapshot ? (
        <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="border-border bg-card mx-4 flex flex-col items-center gap-2 rounded-2xl border p-6 text-center shadow-sm">
          <IconTile icon={Bell} tone="neutral" size="lg" />
          <p className="text-foreground font-semibold">Nada por aqui ainda</p>
          <p className="text-muted text-sm">Tudo que o Capital te avisar aparece nesta lista.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-4">
          {items.map((item) => {
            const visual = CATEGORY_VISUAL[item.category];
            const unreadItem = !item.readAt;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void open(item)}
                  className={`border-border bg-card hover:border-primary/40 flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-sm ${
                    unreadItem ? '' : 'opacity-70'
                  }`}
                >
                  <IconTile icon={visual.icon} tone={visual.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={`text-foreground block truncate ${unreadItem ? 'font-semibold' : 'font-medium'}`}
                      >
                        {item.title}
                      </span>
                      {unreadItem && <span aria-hidden className="bg-primary h-2 w-2 shrink-0 rounded-full" />}
                    </span>
                    <span className="text-muted block text-sm">{item.body}</span>
                    <span className="text-muted/80 block text-xs">
                      {NOTIFICATION_CATEGORY_LABELS[item.category]} · {formatWhen(item.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {configuring && (
        <BottomSheet open title="Notificações" onClose={() => setConfiguring(false)}>
          <div className="flex flex-col gap-6">
            <NotificationsSection />
            <NotificationPreferencesSection />
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
