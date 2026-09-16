'use client';

import { useState } from 'react';
import {
  createId,
  formatBRL,
  formatMonthLabel,
  parseAmountInput,
  quotasForAmount,
  todayISO,
  type InvestmentBucket,
  type TopicConfig,
} from '@/lib/budget';
import { walletRepository } from '@/lib/storage';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSettings } from '@/components/providers/SettingsProvider';
import { AmountInput } from '@/components/ui/AmountInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { ModuleGate } from '@/components/wallet/ModuleGate';
import { useWallet } from '@/components/wallet/WalletProvider';

export function ReservaScreen() {
  return (
    <ModuleGate module="investments">
      <Reserva />
    </ModuleGate>
  );
}

/** Quotas are fractional; show enough digits to recognise them without a wall of zeros. */
function formatQuotas(quotas: number): string {
  return quotas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

const SOURCE_LABELS = { b3: 'B3', yahoo: 'Yahoo Finance' } as const;

function formatFetchedAt(iso: string | null): string {
  if (!iso) return 'sem cotação';
  const date = new Date(iso);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function Reserva() {
  const { settings } = useSettings();
  const { snapshot, loading, error, month, run } = useWallet();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [trading, setTrading] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [editingBucket, setEditingBucket] = useState<InvestmentBucket | 'new' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if ((loading && !snapshot) || !snapshot) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const { investments } = snapshot;
  const topics = settings?.topics ?? [];

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await run(() => walletRepository.refreshPrice());
      showToast('Cotação atualizada.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível atualizar a cotação.', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDeleteBucket(bucket: InvestmentBucket) {
    const confirmed = await confirm({
      title: 'Excluir categoria da reserva',
      message: `Excluir a categoria "${bucket.name}" da reserva? As ${formatQuotas(bucket.quotas)} cotas dela voltam para a reserva livre. Os gastos que você já lançou continuam nos meses.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) {
      showToast('Operação cancelada. Nenhuma alteração foi realizada.', 'info');
      return;
    }
    await run(() => walletRepository.deleteBucket(bucket.id));
    showToast('Categoria excluída da reserva.');
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader
        title="Reserva investida"
        subtitle={`Competência: ${formatMonthLabel(month)}`}
        backHref="/carteira"
      />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-foreground text-lg font-semibold">{investments.ticker}</p>
            {investments.assetName && (
              <p className="text-muted truncate text-xs">{investments.assetName}</p>
            )}
            <p className="text-muted text-xs">
              {investments.price === null
                ? 'Sem cotação ainda'
                : `${formatBRL(investments.price)} por cota · ${formatFetchedAt(investments.fetchedAt)}`}
              {investments.source && ` · fonte: ${SOURCE_LABELS[investments.source]}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="border-border text-foreground min-h-[36px] shrink-0 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
          >
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>

        {investments.stale && investments.price !== null && (
          <p className="bg-warning-bg text-warning rounded-lg px-3 py-2 text-xs">
            Essa cotação está velha. Atualize antes de remanejar.
          </p>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Total ({formatQuotas(investments.totalQuotas)} cotas)</span>
          <span className="text-foreground font-semibold">{formatBRL(investments.totalValue)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Reserva livre ({formatQuotas(investments.freeQuotas)} cotas)</span>
          <span className="text-foreground font-semibold">{formatBRL(investments.freeValue)}</span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTrading(true)}
            className="border-border text-foreground min-h-[44px] flex-1 rounded-lg border px-3 text-sm font-medium"
          >
            Comprar ou vender
          </button>
          <button
            type="button"
            onClick={() => setAllocating(true)}
            disabled={investments.price === null || investments.buckets.length === 0}
            className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
          >
            Remanejar
          </button>
        </div>
        {investments.price === null && (
          <p className="text-muted text-xs">Sem cotação não dá para remanejar: atualize primeiro.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 px-4">
        <div className="flex items-center justify-between">
          <h2 className="text-muted text-sm font-semibold">Categorias da reserva</h2>
          <button
            type="button"
            onClick={() => setEditingBucket('new')}
            className="text-primary min-h-[36px] text-sm font-medium"
          >
            + Nova categoria
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {investments.buckets.map((bucket) => (
            <li
              key={bucket.id}
              className="border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setEditingBucket(bucket)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="text-foreground block truncate font-medium">{bucket.name}</span>
                <span className="text-muted block text-xs">
                  {formatQuotas(bucket.quotas)} cotas ·{' '}
                  {topics.find((topic) => topic.id === bucket.topicId)?.name ?? 'sem categoria'}
                </span>
              </button>
              <span className="text-foreground shrink-0 font-semibold">{formatBRL(bucket.value)}</span>
              <button
                type="button"
                onClick={() => void handleDeleteBucket(bucket)}
                className="text-danger min-h-[36px] shrink-0 text-xs font-medium"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>

        {investments.buckets.length === 0 && (
          <p className="text-muted py-6 text-center text-sm">
            Nenhuma categoria ainda. Cada uma guarda parte da reserva para uma categoria do orçamento — Metas,
            Conhecimento — e o que sobra é a reserva livre.
          </p>
        )}
      </section>

      <TickerSection ticker={investments.ticker} />

      {trading && (
        <TradeSheet
          ticker={investments.ticker}
          totalQuotas={investments.totalQuotas}
          onClose={() => setTrading(false)}
          onSave={async (delta) => {
            try {
              await run(() => walletRepository.tradeQuotas(delta));
              setTrading(false);
              showToast('Operação realizada com sucesso!');
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error');
            }
          }}
        />
      )}

      {allocating && investments.price !== null && (
        <AllocateSheet
          buckets={investments.buckets}
          price={investments.price}
          month={month}
          onClose={() => setAllocating(false)}
          onSave={async (bucketId, amount) => {
            try {
              await run(() =>
                walletRepository.allocate({ bucketId, amount, month, date: todayISO() }),
              );
              setAllocating(false);
              showToast('Operação realizada! Um gasto com esse valor entrou no seu controle.');
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Não foi possível remanejar.', 'error');
            }
          }}
        />
      )}

      {editingBucket && (
        <BucketFormSheet
          topics={topics}
          initial={editingBucket === 'new' ? undefined : editingBucket}
          onClose={() => setEditingBucket(null)}
          onSave={async (bucket) => {
            try {
              await run(() => walletRepository.saveBucket(bucket));
              setEditingBucket(null);
              showToast('Operação concluída com sucesso!');
            } catch {
              showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
            }
          }}
        />
      )}
    </div>
  );
}

/** Which ticker the reserve follows. Changing it starts the price cache over for that code. */
function TickerSection({ ticker }: { ticker: string }) {
  const { run } = useWallet();
  const { showToast } = useToast();
  const [value, setValue] = useState(ticker);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await run(() => walletRepository.setTicker(value));
      showToast('Ativo atualizado. Atualize a cotação para ver o valor.');
    } catch {
      showToast('Não foi possível salvar o ativo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 px-4">
      <h2 className="text-muted text-sm font-semibold">Ativo da reserva</h2>
      <div className="border-border bg-card flex items-end gap-2 rounded-xl border p-4 shadow-sm">
        <label className="text-muted flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Código na bolsa
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] w-full rounded-md border px-3 uppercase outline-none focus:ring-2"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || value.trim() === ticker}
          className="border-border text-foreground min-h-[44px] shrink-0 rounded-lg border px-4 text-sm font-medium disabled:opacity-50"
        >
          Salvar
        </button>
      </div>
    </section>
  );
}

function TradeSheet({
  ticker,
  totalQuotas,
  onClose,
  onSave,
}: {
  ticker: string;
  totalQuotas: number;
  onClose: () => void;
  onSave: (delta: number) => Promise<void>;
}) {
  const [operation, setOperation] = useState<'buy' | 'sell'>('buy');
  const [quotas, setQuotas] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = parseAmountInput(quotas);

  return (
    <BottomSheet open title={`Comprar ou vender ${ticker}`} onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!(parsed > 0)) return;
          setSaving(true);
          try {
            await onSave(operation === 'buy' ? parsed : -parsed);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex gap-2">
          {(
            [
              ['buy', 'Comprar'],
              ['sell', 'Vender'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setOperation(value)}
              className={`min-h-[44px] flex-1 rounded-lg border px-3 text-sm font-medium ${
                operation === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Quantidade de cotas
          <input
            type="text"
            inputMode="decimal"
            value={quotas}
            onChange={(e) => setQuotas(e.target.value)}
            autoFocus
            placeholder="0"
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <p className="text-muted text-sm">
          Você tem {formatQuotas(totalQuotas)} cotas. Depois desta operação:{' '}
          {formatQuotas(operation === 'buy' ? totalQuotas + parsed : totalQuotas - parsed)}.
        </p>

        <button
          type="submit"
          disabled={saving || !(parsed > 0)}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Confirmar'}
        </button>
      </form>
    </BottomSheet>
  );
}

function AllocateSheet({
  buckets,
  price,
  month,
  onClose,
  onSave,
}: {
  buckets: { id: string; name: string }[];
  price: number;
  month: string;
  onClose: () => void;
  onSave: (bucketId: string, amount: number) => Promise<void>;
}) {
  const [bucketId, setBucketId] = useState(buckets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = parseAmountInput(amount);

  return (
    <BottomSheet open title="Remanejar para uma categoria" onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!bucketId || !(parsed > 0)) return;
          setSaving(true);
          try {
            await onSave(bucketId, parsed);
          } finally {
            setSaving(false);
          }
        }}
      >
        <AmountInput value={amount} onChange={setAmount} autoFocus />

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Categoria da reserva
          <select
            value={bucketId}
            onChange={(e) => setBucketId(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          >
            {buckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name}
              </option>
            ))}
          </select>
        </label>

        <p className="text-muted text-sm">
          {parsed > 0
            ? `São ${formatQuotas(quotasForAmount(parsed, price))} cotas a ${formatBRL(price)}. `
            : ''}
          O valor também vira um gasto na categoria do orçamento ligada a ela, na competência de{' '}
          {formatMonthLabel(month)}.
        </p>

        <button
          type="submit"
          disabled={saving || !(parsed > 0)}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Confirmar'}
        </button>
      </form>
    </BottomSheet>
  );
}

function BucketFormSheet({
  topics,
  initial,
  onClose,
  onSave,
}: {
  topics: TopicConfig[];
  initial?: InvestmentBucket;
  onClose: () => void;
  onSave: (bucket: InvestmentBucket) => Promise<void>;
}) {
  const activeTopics = topics.filter((t) => !t.archived).sort((a, b) => a.order - b.order);
  const [name, setName] = useState(initial?.name ?? '');
  const [topicId, setTopicId] = useState(initial?.topicId ?? activeTopics[0]?.id ?? '');
  const [quotas, setQuotas] = useState(initial ? String(initial.quotas) : '0');
  const [saving, setSaving] = useState(false);
  const parsedQuotas = parseAmountInput(quotas);

  return (
    <BottomSheet open title={initial ? 'Editar categoria da reserva' : 'Nova categoria da reserva'} onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim() || !topicId) return;
          setSaving(true);
          try {
            await onSave({
              id: initial?.id ?? createId(),
              name: name.trim(),
              topicId,
              quotas: Math.max(0, parsedQuotas),
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Nome
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!initial}
            placeholder="Ex.: Metas, Conhecimento..."
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Categoria do orçamento que ela alimenta
          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          >
            {activeTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
          <span className="text-muted text-xs">
            Remanejar para esta categoria da reserva lança o gasto nessa categoria do orçamento.
          </span>
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Cotas guardadas
          <input
            type="text"
            inputMode="decimal"
            value={quotas}
            onChange={(e) => setQuotas(e.target.value)}
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>

        <button
          type="submit"
          disabled={saving || !name.trim() || !topicId}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </BottomSheet>
  );
}
