'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { apiRequest } from '@/lib/storage/apiClient';
import { toStorageErrorMessage } from '@/lib/storage/errors';

interface ProbeStep {
  title: string;
  status: number | null;
  ok: boolean;
  note?: string;
  data?: unknown;
}

interface ProbeAnswer {
  steps: ProbeStep[];
  itemId?: string | null;
  oauthUrl?: string | null;
}

type Action = 'check' | 'create' | 'inspect' | 'delete';

const ITEM_KEY = 'capital:pluggy-probe-item';
const ITEMS_KEY = 'capital:pluggy-probe-items';

const inputClass =
  'border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-full min-w-0 rounded-lg border px-3 text-base outline-none focus:ring-2';
const buttonClass =
  'bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center rounded-lg px-4 font-semibold disabled:opacity-50';

/**
 * Throwaway screen for F0: the Client ID and Secret live only in this page's memory and go to the
 * server with each test; the server answers the shape of Pluggy's replies, never bank values.
 */
export function ProbeScreen() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('https://capital.rincon.dev.br/');
  const [itemId, setItemId] = useState('');
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProbeStep[]>([]);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<string[]>([]);

  // The item ids (not secrets; one per bank) survive this tab leaving for the authorization and
  // coming back.
  useEffect(() => {
    try {
      const list = JSON.parse(sessionStorage.getItem(ITEMS_KEY) ?? '[]') as string[];
      const single = sessionStorage.getItem(ITEM_KEY);
      const saved = [...new Set([...list, ...(single ? [single] : [])])];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once, after hydration
      setItems(saved);
      if (saved.length > 0) setItemId(saved[saved.length - 1]);
    } catch {
      // no storage: the list just starts empty
    }
  }, []);

  function saveItems(next: string[]) {
    setItems(next);
    try {
      sessionStorage.setItem(ITEMS_KEY, JSON.stringify(next));
      sessionStorage.removeItem(ITEM_KEY);
    } catch {
      // no storage
    }
  }

  function rememberItem(id: string) {
    setItemId(id);
    saveItems([...items.filter((saved) => saved !== id), id]);
  }

  const ready = clientId.trim() !== '' && clientSecret.trim() !== '';
  const hasItem = /^[0-9a-f-]{36}$/i.test(itemId.trim());

  async function run(action: Action) {
    if (action === 'delete' && !window.confirm('Apagar esta conexão na Pluggy?')) return;
    setBusy(action);
    setError(null);
    try {
      const answer = await apiRequest<ProbeAnswer>('POST', '/banks/probe', {
        clientId,
        clientSecret,
        action,
        redirectUri: redirectUri.trim() || undefined,
        itemId: hasItem ? itemId.trim() : undefined,
      });
      setSteps(answer.steps);
      if (action === 'create') {
        if (answer.itemId) rememberItem(answer.itemId);
        setOauthUrl(answer.oauthUrl ?? null);
      }
      if (action === 'delete') {
        setOauthUrl(null);
        if (answer.steps.some((s) => s.title.startsWith('DELETE') && s.ok)) {
          saveItems(items.filter((saved) => saved !== itemId.trim()));
        }
      }
    } catch (err) {
      setError(toStorageErrorMessage(err, 'O teste não rodou.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader title="Open Finance — teste da API" subtitle="F0, só no localhost" backHref="/" />

      <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
        <p className="text-muted text-sm">
          A chave fica só nesta página e não é salva. O resultado mostra os campos que a Pluggy
          preenche, sem valores.
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Client ID
          <input
            className={inputClass}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Client Secret
          <input
            className={inputClass}
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Endereço de volta (HTTPS)
          <input
            className={inputClass}
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
            spellCheck={false}
          />
        </label>
        <button className={buttonClass} disabled={!ready || busy !== null} onClick={() => run('check')}>
          {busy === 'check' ? 'Testando…' : '1. Testar a chave'}
        </button>
        <button className={buttonClass} disabled={!ready || busy !== null} onClick={() => run('create')}>
          {busy === 'create' ? 'Criando…' : '2. Criar conexão do Meu Pluggy'}
        </button>
        {oauthUrl && (
          <a
            href={oauthUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary text-center font-semibold underline"
          >
            Abrir a autorização (em outra aba)
          </a>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Id da conexão (item)
          <input
            className={inputClass}
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            spellCheck={false}
            placeholder="Vem do passo 2 ou do dashboard"
          />
        </label>
        {items.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-muted text-sm">Conexões criadas nesta aba (uma por banco):</p>
            {items.map((id, index) => (
              <button
                key={id}
                onClick={() => setItemId(id)}
                className={`border-border min-h-[40px] rounded-lg border px-3 text-left font-mono text-xs ${
                  id === itemId.trim() ? 'bg-primary/15 text-primary' : 'text-foreground'
                }`}
              >
                {index + 1}. {id}
              </button>
            ))}
          </div>
        )}
        <button
          className={buttonClass}
          disabled={!ready || !hasItem || busy !== null}
          onClick={() => run('inspect')}
        >
          {busy === 'inspect' ? 'Lendo…' : '3. Ver o que a conexão traz'}
        </button>
        <button
          className="text-danger min-h-[44px] rounded-lg font-semibold disabled:opacity-50"
          disabled={!ready || !hasItem || busy !== null}
          onClick={() => run('delete')}
        >
          {busy === 'delete' ? 'Apagando…' : 'Apagar esta conexão'}
        </button>
        {error && <p className="text-danger text-sm">{error}</p>}
      </section>

      {steps.map((step, index) => (
        <section
          key={`${step.title}-${index}`}
          className="border-border bg-card mx-4 flex flex-col gap-1 rounded-2xl border p-4 shadow-sm"
        >
          <p className="font-semibold">
            {step.ok ? '✓' : '✗'} {step.title}
            {step.status !== null && <span className="text-muted font-normal"> · {step.status}</span>}
          </p>
          {step.note && <p className="text-muted text-sm break-words">{step.note}</p>}
          {step.data !== undefined && (
            <pre className="bg-background overflow-x-auto rounded-lg p-2 text-xs whitespace-pre-wrap">
              {JSON.stringify(step.data, null, 2)}
            </pre>
          )}
        </section>
      ))}
    </main>
  );
}
