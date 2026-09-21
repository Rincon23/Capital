'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, ExternalLink, Mail, MailCheck, MailWarning, Plus, RefreshCw, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { NotificationsHint } from '@/components/pwa/NotificationsHint';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { IconTile } from '@/components/ui/IconTile';
import { useToast } from '@/components/ui/Toast';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton, ModuleSettingsButton } from '@/components/modules/ModuleHelpButton';
import { ModuleSettingsSheet } from '@/components/modules/ModuleSettingsSheet';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { useBackHref } from '@/components/modules/useBackHref';
import { gmailConnectErrorMessage, senderName, type GmailAlert, type GmailOverview } from '@/lib/gmail';
import { GMAIL_CONNECT_URL, gmailRepository } from '@/lib/storage';
import { toStorageErrorMessage } from '@/lib/storage/errors';

export function GmailScreen() {
  return (
    <ModuleGate module="gmail">
      <Gmail />
    </ModuleGate>
  );
}

const whenFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** "16/09 às 14:59" */
function formatWhen(iso: string): string {
  const parts = Object.fromEntries(whenFormatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

/** "agora mesmo", "há 3 min", "às 14:59 de 16/09" */
function formatChecked(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  return `em ${formatWhen(iso)}`;
}

function Card({ children, tour }: { children: ReactNode; tour?: string }) {
  return (
    <section
      data-tour={tour}
      className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
    >
      {children}
    </section>
  );
}

function Gmail() {
  const backHref = useBackHref('gmail');
  const [configuring, setConfiguring] = useState(false);
  const router = useRouter();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [overview, setOverview] = useState<GmailOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setOverview(await gmailRepository.getOverview());
      setError(null);
    } catch (err) {
      setError(toStorageErrorMessage(err, 'Não foi possível abrir o monitor de Gmail.'));
    }
  }, []);

  useEffect(() => {
    // Back from Google: show how it went, then clean the address.
    const params = new URLSearchParams(window.location.search);
    if (params.get('conectado')) showToast('Gmail conectado! As palavras-chave já estão sendo monitoradas.');
    const error = params.get('erro');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (error) setConnectError(gmailConnectErrorMessage(error));
    if (params.size > 0) router.replace('/gmail');
    void load();
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [load, router, showToast]);

  async function act(key: string, action: () => Promise<void>) {
    setBusy(key);
    try {
      await action();
      await load();
    } catch (err) {
      showToast(toStorageErrorMessage(err, 'Não foi possível concluir esta operação.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  useModuleIntro('gmail', { ready: !!overview });

  const header = (
    <PageHeader
      title="Monitor de Gmail"
      backHref={backHref}
      action={
        <>
          <ModuleHelpButton module="gmail" />
          <ModuleSettingsButton module="gmail" tourAnchor="gmail-config" onClick={() => setConfiguring(true)} />
        </>
      }
    />
  );

  if (!overview) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-10">
        {header}
        {error ? (
          <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>
        ) : (
          <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>
        )}
      </div>
    );
  }

  const { account } = overview;

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      {header}

      {connectError && (
        <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{connectError}</p>
      )}

      <NotificationsHint />

      <Card tour="gmail-conta">
        {!overview.configured ? (
          <SetupSteps redirectUri={overview.redirectUri} />
        ) : !account ? (
          <>
            <div className="flex items-center gap-3">
              <IconTile icon={Mail} tone="red" />
              <p className="text-foreground font-semibold">Conecte o seu Gmail</p>
            </div>
            <p className="text-muted text-sm">
              O Capital olha o assunto, o remetente e a prévia dos e-mails que chegarem e avisa no celular
              quando aparecer uma das suas palavras-chave. A permissão é só de leitura: ele não apaga, não
              envia e não marca nada.
            </p>
            <a
              href={GMAIL_CONNECT_URL}
              className="bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 font-semibold"
            >
              <Mail className="h-4 w-4" aria-hidden />
              Conectar Gmail
            </a>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <IconTile
                icon={account.status === 'ok' ? MailCheck : MailWarning}
                tone={account.status === 'ok' ? 'green' : 'amber'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate font-semibold">{account.email}</p>
                <p className="text-muted text-sm">
                  {account.lastCheckedAt
                    ? `Verificado ${formatChecked(account.lastCheckedAt, now)}`
                    : 'A primeira verificação sai em até um minuto.'}
                </p>
              </div>
            </div>

            {account.status !== 'ok' && account.lastError && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  account.status === 'reconnect' ? 'bg-danger-bg text-danger' : 'bg-warning-bg text-warning'
                }`}
              >
                {account.lastError}
              </p>
            )}

            {account.status === 'reconnect' ? (
              <a
                href={GMAIL_CONNECT_URL}
                className="bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 font-semibold"
              >
                <Mail className="h-4 w-4" aria-hidden />
                Conectar de novo
              </a>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void act('check', async () => {
                      const result = await gmailRepository.checkNow();
                      if (result.status === 'ok') {
                        showToast(
                          result.alerts > 0
                            ? `${result.alerts} ${result.alerts === 1 ? 'e-mail encontrado' : 'e-mails encontrados'}; aviso enviado.`
                            : 'Nenhum e-mail novo com as suas palavras-chave.',
                          'info',
                        );
                      }
                    })
                  }
                  className="border-border text-foreground flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${busy === 'check' ? 'animate-spin' : ''}`} aria-hidden />
                  Verificar agora
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Desconectar o Gmail',
                      message: `O Capital para de olhar os e-mails de ${account.email}. As palavras-chave e o histórico de alertas continuam aqui.`,
                      confirmLabel: 'Desconectar',
                      destructive: true,
                    });
                    if (ok) void act('disconnect', () => gmailRepository.disconnect());
                  }}
                  className="border-danger text-danger min-h-[44px] rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
                >
                  Desconectar
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card tour="gmail-palavras">
        <div>
          <p className="text-foreground font-semibold">Palavras-chave</p>
          <p className="text-muted text-sm">
            Um aviso por e-mail, com todas as palavras que ele tiver. Maiúsculas e acentos não importam.
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = keyword.trim();
            if (!value) return;
            void act('add', async () => {
              await gmailRepository.addKeyword(value);
              setKeyword('');
              showToast('Palavra-chave adicionada! Ela já está sendo monitorada.');
            });
          }}
        >
          <input
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            maxLength={100}
            placeholder="Ex.: boleto, fatura, entrevista"
            aria-label="Nova palavra-chave"
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] min-w-0 flex-1 rounded-lg border px-3 text-base outline-none focus:ring-2"
          />
          <button
            type="submit"
            disabled={!keyword.trim() || busy !== null}
            aria-label="Adicionar palavra-chave"
            className="bg-primary text-primary-foreground flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 font-semibold disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Adicionar
          </button>
        </form>
        {overview.keywords.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma palavra-chave ainda.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {overview.keywords.map((item) => (
              <li
                key={item.id}
                className="border-border bg-background text-foreground flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm"
              >
                {item.keyword}
                <button
                  type="button"
                  disabled={busy !== null}
                  aria-label={`Remover ${item.keyword}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Remover palavra-chave',
                      message: `• Palavra-chave: "${item.keyword}". Os e-mails com ela deixam de gerar aviso.`,
                      confirmLabel: 'Remover',
                      destructive: true,
                    });
                    if (ok) void act(`remove-${item.id}`, () => gmailRepository.deleteKeyword(item.id));
                  }}
                  className="text-muted hover:text-danger flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="flex flex-col gap-2" data-tour="gmail-alertas">
        <h2 className="text-muted px-4 text-sm font-semibold">Alertas recentes</h2>
        {overview.alerts.length === 0 ? (
          <p className="text-muted px-4 text-sm">
            Nenhum alerta ainda. Os e-mails que chegarem com as suas palavras-chave aparecem aqui.
          </p>
        ) : (
          <ul className="border-border bg-card divide-border mx-4 divide-y rounded-2xl border shadow-sm">
            {overview.alerts.map((alert) => (
              <AlertRow key={alert.messageId} alert={alert} />
            ))}
          </ul>
        )}
      </section>

      {configuring && (
        <ModuleSettingsSheet module="gmail" onClose={() => setConfiguring(false)}>
          <NotificationsSection />
        </ModuleSettingsSheet>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: GmailAlert }) {
  return (
    <li>
      <a
        href={alert.url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:bg-background flex items-start gap-3 px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-semibold">{alert.subject || '(sem assunto)'}</p>
          <p className="text-muted truncate text-sm">
            {senderName(alert.from)} · {formatWhen(alert.receivedAt)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {alert.keywords.map((word) => (
              <span
                key={word}
                className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
              >
                {word}
              </span>
            ))}
          </div>
        </div>
        <ExternalLink className="text-muted mt-0.5 h-4 w-4 shrink-0" aria-label="Abrir no Gmail" />
      </a>
    </li>
  );
}

/**
 * Shown until the server has the Google client and the encryption key. Everyone sees that the
 * monitor isn't available yet; only the server's admin (the API sends `redirectUri` to them
 * alone) sees how to set it up.
 */
function SetupSteps({ redirectUri }: { redirectUri: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!redirectUri) {
    return (
      <>
        <div className="flex items-center gap-3">
          <IconTile icon={MailWarning} tone="amber" />
          <p className="text-foreground font-semibold">Ainda não disponível</p>
        </div>
        <p className="text-muted text-sm">
          O monitor de Gmail ainda não foi configurado neste servidor. Enquanto isso, você já pode cadastrar
          as palavras-chave.
        </p>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3">
        <IconTile icon={MailWarning} tone="amber" />
        <p className="text-foreground font-semibold">Falta configurar o Google no servidor</p>
      </div>
      <p className="text-muted text-sm">Só quem administra o servidor vê este passo a passo.</p>
      <ol className="text-muted flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>
          No Google Cloud, ative a Gmail API e, em APIs e serviços → Credenciais, crie um ID do cliente OAuth
          do tipo &quot;Aplicativo da Web&quot;.
        </li>
        <li>
          Em &quot;URIs de redirecionamento autorizados&quot;, adicione:
          <span className="mt-1 flex items-center gap-2">
            <code className="bg-background text-foreground min-w-0 flex-1 rounded px-2 py-1 text-xs break-all">
              {redirectUri}
            </code>
            <button
              type="button"
              aria-label="Copiar endereço"
              onClick={() => {
                void navigator.clipboard?.writeText(redirectUri).then(() => setCopied(true));
              }}
              className="text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </button>
          </span>
        </li>
        <li>
          Coloque o ID e a chave secreta em GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local, gere a
          ENCRYPTION_KEY (comando no .env.example) e reinicie o app.
        </li>
        <li>
          Na tela de consentimento OAuth, publique o app (&quot;Em produção&quot;). Em &quot;Teste&quot;, só
          os e-mails cadastrados como testadores conseguem conectar e a conexão cai a cada 7 dias.
        </li>
      </ol>
    </>
  );
}
