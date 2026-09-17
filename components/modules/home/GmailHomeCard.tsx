'use client';

import { useEffect, useState } from 'react';
import { senderName, type GmailOverview } from '@/lib/gmail';
import { gmailRepository } from '@/lib/storage';
import { toStorageErrorMessage } from '@/lib/storage/errors';
import { CardNote, HomeCard, Skeleton } from './HomeCard';

const SHOWN_ALERTS = 2;

const whenFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** Monitor de Gmail: whether the account is connected and working, and the latest alerts. */
export function GmailHomeCard() {
  const [overview, setOverview] = useState<GmailOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    gmailRepository
      .getOverview()
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch((err: unknown) => {
        if (active) setError(toStorageErrorMessage(err, 'Não foi possível carregar o Gmail.'));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <HomeCard module="gmail" href="/gmail">
      {error ? (
        <CardNote tone="danger">{error}</CardNote>
      ) : !overview ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : !overview.configured ? (
        <CardNote>Ainda não disponível neste servidor.</CardNote>
      ) : !overview.account ? (
        <CardNote>Nenhuma conta conectada. Toque para conectar o seu Gmail.</CardNote>
      ) : (
        <>
          <p className="text-sm">
            <span className="text-foreground font-medium break-all">{overview.account.email}</span>
            <span
              className={`block text-xs ${overview.account.status === 'ok' ? 'text-muted' : 'text-warning'}`}
            >
              {overview.account.status === 'ok'
                ? `Monitorando ${overview.keywords.length} ${overview.keywords.length === 1 ? 'palavra-chave' : 'palavras-chave'}`
                : overview.account.status === 'reconnect'
                  ? 'Reconecte a conta para voltar a receber avisos'
                  : 'A última verificação falhou'}
            </span>
          </p>
          {overview.alerts.length === 0 ? (
            <CardNote>Nenhum alerta ainda.</CardNote>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {overview.alerts.slice(0, SHOWN_ALERTS).map((alert) => (
                <li key={alert.messageId} className="flex flex-col py-1.5 text-sm">
                  <span className="text-foreground truncate">{alert.subject || '(sem assunto)'}</span>
                  <span className="text-muted truncate text-xs">
                    {senderName(alert.from)} · {whenFormatter.format(new Date(alert.receivedAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </HomeCard>
  );
}
