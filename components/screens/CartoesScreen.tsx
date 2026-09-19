'use client';

import { useState } from 'react';
import {
  billDueDate,
  CARD_NOTIFY_BEFORE_OPTIONS,
  createId,
  currentMonthKey,
  dueLabel,
  formatBRL,
  formatDayMonth,
  formatMonthLabel,
  formatMonthShort,
  nominalDueDate,
  openBills,
  type CardBill,
  type CardDueMonth,
  type CardSettings,
  type CreditCard,
} from '@/lib/budget';
import { walletRepository } from '@/lib/storage';
import { useCards } from '@/components/cards/CardsProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleGate } from '@/components/modules/ModuleGate';
import { ModuleHelpButton, ModuleSettingsButton } from '@/components/modules/ModuleHelpButton';
import { ModuleSettingsSheet } from '@/components/modules/ModuleSettingsSheet';
import { useBackHref } from '@/components/modules/useBackHref';
import { useModuleIntro } from '@/components/modules/useModuleIntro';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { useWallet } from '@/components/wallet/WalletProvider';

export function CartoesScreen() {
  return (
    <ModuleGate module="cards">
      <Cartoes />
    </ModuleGate>
  );
}

const INPUT =
  'border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2';

function notifyBeforeLabel(days: number): string {
  if (days === 0) return 'Só no dia';
  return days === 1 ? '1 dia antes' : `${days} dias antes`;
}

function Cartoes() {
  const backHref = useBackHref('cards');
  const { snapshot, loading, error, run } = useWallet();
  const { refresh: refreshCards } = useCards();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { setupOpen, finishSetup } = useModuleIntro('cards', { ready: !!snapshot, withSetup: true });

  if ((loading && !snapshot) || !snapshot) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const { cards, bills } = snapshot;
  const open = openBills(bills);
  const total = open.reduce((sum, bill) => sum + bill.total, 0);
  const firstCardSetup = setupOpen && cards.length === 0;

  async function write(action: () => Promise<void>, message: string) {
    try {
      await run(action);
      await refreshCards();
      showToast(message);
    } catch {
      showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
    }
  }

  async function handleSave(card: CreditCard) {
    await write(() => walletRepository.saveCard(card), 'Cartão salvo.');
    setEditing(null);
    finishSetup();
  }

  async function handleDelete(card: CreditCard) {
    const confirmed = await confirm({
      title: 'Excluir cartão',
      message: (
        <>
          Excluir <strong>{card.name}</strong>? As compras já lançadas continuam onde estão: elas
          só deixam de pertencer a este cartão e voltam a sair da dívida sozinhas no dia 1º do mês
          seguinte.
        </>
      ),
      confirmLabel: 'Excluir',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) {
      showToast('Operação cancelada. Nenhuma alteração foi realizada.', 'info');
      return;
    }
    await write(() => walletRepository.deleteCard(card.id), 'Cartão excluído.');
    setEditing(null);
  }

  async function handlePay(bill: CardBill) {
    if (!bill.cardId) return;
    const confirmed = await confirm({
      title: 'Fatura paga',
      message: (
        <>
          Marcar a fatura de <strong>{bill.cardName}</strong> ({formatMonthLabel(bill.month)}),{' '}
          {formatBRL(bill.total)}, como paga? Ela sai da dívida na Reserva de emergência e os avisos
          param.
        </>
      ),
      confirmLabel: 'Fatura paga',
      cancelLabel: 'Ainda não',
    });
    if (!confirmed) return;
    await write(
      () => walletRepository.payBill({ cardId: bill.cardId as string, month: bill.month }),
      'Fatura marcada como paga.',
    );
  }

  async function handleUnpay(bill: CardBill) {
    if (!bill.cardId) return;
    await write(
      () => walletRepository.unpayBill({ cardId: bill.cardId as string, month: bill.month }),
      'Fatura marcada como não paga.',
    );
  }

  async function handleAssign(bill: CardBill, cardId: string) {
    await write(
      () => walletRepository.assignMonthToCard({ cardId, month: bill.month }),
      'Compras atribuídas ao cartão.',
    );
  }

  async function handleSettings(next: CardSettings) {
    await write(() => walletRepository.saveCardSettings(next), 'Configuração salva.');
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-10">
      <PageHeader
        title="Cartões"
        subtitle={`Competência: ${formatMonthLabel(currentMonthKey())}`}
        backHref={backHref}
        action={
          <>
            <ModuleHelpButton module="cards" />
            <ModuleSettingsButton module="cards" onClick={() => setSettingsOpen(true)} tourAnchor="cartoes-config" />
            <button
              type="button"
              onClick={() => setEditing('new')}
              aria-label="Novo cartão"
              data-tour="cartoes-novo"
              className="bg-primary text-primary-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            >
              +
            </button>
          </>
        }
      />

      {error && <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>}

      <section
        data-tour="cartoes-total"
        className="border-border bg-card mx-4 flex flex-col gap-1 rounded-xl border p-4 shadow-sm"
      >
        <span className="text-muted text-sm">Faturas em aberto</span>
        <span className="text-foreground text-2xl font-bold tracking-tight tabular-nums">
          {formatBRL(total)}
        </span>
        <span className="text-muted text-xs">{summaryCaption(open)}</span>
      </section>

      <section data-tour="cartoes-pagar" className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">A pagar</h2>
        {open.length === 0 ? (
          <p className="border-border text-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Nenhuma fatura em aberto.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((bill) => (
              <li
                key={`${bill.cardId ?? 'sem'}:${bill.month}`}
                className="border-border bg-card flex flex-col gap-2 rounded-xl border px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate font-medium">{bill.cardName}</p>
                    <p className="text-muted text-xs">
                      {formatMonthShort(bill.month)} · {dueLabel(bill)}
                      {bill.postponedFrom && ` · caiu num fim de semana`}
                    </p>
                  </div>
                  <p className="text-foreground shrink-0 font-semibold tabular-nums">
                    {formatBRL(bill.total)}
                  </p>
                </div>
                {bill.cardId ? (
                  <button
                    type="button"
                    onClick={() => void handlePay(bill)}
                    className="bg-primary text-primary-foreground min-h-[40px] rounded-lg px-4 text-sm font-semibold"
                  >
                    Fatura paga
                  </button>
                ) : (
                  <NoCardBill bill={bill} cards={cards} onAssign={handleAssign} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-tour="cartoes-lista" className="flex flex-col gap-2 px-4">
        <h2 className="text-muted text-sm font-semibold">Seus cartões</h2>
        {cards.length === 0 ? (
          <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 text-sm shadow-sm">
            <p className="text-muted">
              Cadastre um cartão para dizer quando a fatura vence, ser avisado antes e marcar como
              paga. Sem nenhum cartão, as compras no cartão saem da dívida sozinhas no dia 1º do mês
              seguinte, como sempre foi.
            </p>
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 text-sm font-semibold"
            >
              Cadastrar cartão
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {cards.map((card) => {
              const paid = bills.filter((bill) => bill.cardId === card.id && bill.paid);
              const last = paid[paid.length - 1];
              return (
                <li key={card.id} className="border-border bg-card rounded-xl border shadow-sm">
                  <button
                    type="button"
                    onClick={() => setEditing(card)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate font-medium">
                        {card.name}
                        {card.isDefault && cards.length > 1 && (
                          <span className="text-muted text-xs font-normal"> · padrão</span>
                        )}
                      </p>
                      <p className="text-muted text-xs">
                        Vence dia {card.dueDay} {card.dueMonth === 'next' ? 'do mês seguinte' : 'do mês'} ·{' '}
                        {card.notifyEnabled ? notifyBeforeLabel(card.notifyBeforeDays).toLowerCase() : 'sem aviso'}
                      </p>
                    </div>
                    <span className="text-muted shrink-0 text-sm">Editar</span>
                  </button>
                  {last && (
                    <div className="border-border flex items-center justify-between gap-3 border-t px-4 py-2">
                      <p className="text-muted text-xs">
                        Fatura de {formatMonthShort(last.month)} paga em{' '}
                        {formatDayMonth((last.paidAt ?? '').slice(0, 10))} · {formatBRL(last.total)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleUnpay(last)}
                        className="text-primary min-h-[36px] shrink-0 text-xs font-semibold"
                      >
                        Desfazer
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(editing || firstCardSetup) && (
        <CardFormSheet
          initial={editing && editing !== 'new' ? editing : undefined}
          isFirst={cards.length === 0}
          order={cards.length}
          onClose={() => {
            setEditing(null);
            finishSetup();
          }}
          onSave={handleSave}
          onDelete={editing && editing !== 'new' ? () => handleDelete(editing) : undefined}
        />
      )}

      {settingsOpen && (
        <ModuleSettingsSheet module="cards" onClose={() => setSettingsOpen(false)}>
          <CardSettingsSection settings={snapshot.cardSettings} onSave={handleSettings} />
          <NotificationsSection />
        </ModuleSettingsSheet>
      )}
    </div>
  );
}

function summaryCaption(open: CardBill[]): string {
  if (open.length === 0) return 'tudo pago';
  const late = open.filter((bill) => bill.daysUntilDue !== null && bill.daysUntilDue < 0);
  if (late.length > 0) {
    return late.length === 1 ? `1 fatura atrasada` : `${late.length} faturas atrasadas`;
  }
  const next = open.find((bill) => bill.dueDate !== null);
  if (!next) return 'sai sozinha na virada do mês';
  return `${next.cardName} ${dueLabel(next)}`;
}

/** The purchases on no registered card: nobody pays this bill by hand, but it can be tied to one. */
function NoCardBill({
  bill,
  cards,
  onAssign,
}: {
  bill: CardBill;
  cards: CreditCard[];
  onAssign: (bill: CardBill, cardId: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-xs">
        Sai da dívida sozinha no dia {formatDayMonth(bill.clearsOn ?? '')}, sem precisar marcar nada.
      </p>
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => void onAssign(bill, card.id)}
              className="border-border text-foreground min-h-[36px] rounded-lg border px-3 text-xs font-medium"
            >
              Atribuir a {card.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardSettingsSection({
  settings,
  onSave,
}: {
  settings: CardSettings;
  onSave: (settings: CardSettings) => Promise<void>;
}) {
  const [notifyTime, setNotifyTime] = useState(settings.notifyTime);

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted text-sm font-semibold">Avisos da fatura</h2>
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-sm">
        <label className="text-muted flex items-center justify-between gap-3 text-sm font-medium">
          Horário do aviso
          <input
            type="time"
            value={notifyTime}
            onChange={(event) => {
              setNotifyTime(event.target.value);
              if (/^\d{2}:\d{2}$/.test(event.target.value)) {
                void onSave({ ...settings, notifyTime: event.target.value });
              }
            }}
            className={`${INPUT} w-32`}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-foreground text-sm font-medium">Insistir até marcar como paga</p>
            <p className="text-muted text-xs">
              Um aviso por dia, por até uma semana depois do vencimento, enquanto a fatura estiver em
              aberto.
            </p>
          </div>
          <Switch
            checked={settings.repeatUntilPaid}
            label="Insistir até marcar como paga"
            onChange={(checked) => void onSave({ ...settings, repeatUntilPaid: checked })}
          />
        </div>
      </div>
    </section>
  );
}

function CardFormSheet({
  initial,
  isFirst,
  order,
  onClose,
  onSave,
  onDelete,
}: {
  initial?: CreditCard;
  isFirst: boolean;
  order: number;
  onClose: () => void;
  onSave: (card: CreditCard) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 10));
  const [dueMonth, setDueMonth] = useState<CardDueMonth>(initial?.dueMonth ?? 'next');
  const [notifyEnabled, setNotifyEnabled] = useState(initial?.notifyEnabled ?? true);
  const [notifyBeforeDays, setNotifyBeforeDays] = useState(initial?.notifyBeforeDays ?? 1);
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? isFirst);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const day = Number.parseInt(dueDay, 10);
  const month = currentMonthKey();
  const preview =
    day >= 1 && day <= 31
      ? previewLine({ dueDay: day, dueMonth }, month)
      : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problems: string[] = [];
    if (!name.trim()) problems.push('Dê um nome ao cartão (Nubank, Itaú...).');
    if (!(day >= 1 && day <= 31)) problems.push('O dia do vencimento vai de 1 a 31.');
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initial?.id ?? createId(),
        name: name.trim(),
        dueDay: day,
        dueMonth,
        notifyEnabled,
        notifyBeforeDays,
        isDefault,
        ...(initial?.color ? { color: initial.color } : {}),
        order: initial?.order ?? order,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title={initial ? 'Editar cartão' : 'Novo cartão'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Nome do cartão
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Nubank, Itaú..."
            autoFocus
            className={INPUT}
          />
        </label>

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Dia do vencimento
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            className={`${INPUT} w-28`}
          />
        </label>

        <div>
          <p className="text-muted mb-2 text-sm font-medium">A fatura de um mês vence</p>
          <div className="flex flex-wrap gap-2">
            <Chip label="No mês seguinte" selected={dueMonth === 'next'} onClick={() => setDueMonth('next')} />
            <Chip label="No mesmo mês" selected={dueMonth === 'same'} onClick={() => setDueMonth('same')} />
          </div>
          {preview && <p className="text-muted mt-2 text-xs">{preview}</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-foreground text-sm font-medium">Avisar do vencimento</p>
            <p className="text-muted text-xs">Uma notificação no celular quando a fatura estiver perto.</p>
          </div>
          <Switch checked={notifyEnabled} label="Avisar do vencimento" onChange={setNotifyEnabled} />
        </div>

        {notifyEnabled && (
          <div>
            <p className="text-muted mb-2 text-sm font-medium">Avisar</p>
            <div className="flex flex-wrap gap-2">
              {CARD_NOTIFY_BEFORE_OPTIONS.map((days) => (
                <Chip
                  key={days}
                  label={notifyBeforeLabel(days)}
                  selected={notifyBeforeDays === days}
                  onClick={() => setNotifyBeforeDays(days)}
                />
              ))}
            </div>
          </div>
        )}

        {!isFirst && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">Cartão padrão</p>
              <p className="text-muted text-xs">O que já vem escolhido ao lançar uma compra no cartão.</p>
            </div>
            <Switch checked={isDefault} label="Cartão padrão" onChange={setIsDefault} />
          </div>
        )}

        {errors.length > 0 && (
          <ul className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">
            {errors.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 pt-1">
          {onDelete && (
            <button
              type="button"
              onClick={() => void onDelete()}
              className="border-danger text-danger min-h-[44px] rounded-lg border px-4 py-2 font-semibold"
            >
              Excluir
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="bg-primary text-primary-foreground min-h-[44px] flex-1 rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}

/** "A fatura de Setembro 2026 vence em 13/10 (segunda, porque caiu num sábado)." */
function previewLine(card: Pick<CreditCard, 'dueDay' | 'dueMonth'>, month: string): string {
  const nominal = nominalDueDate(card, month);
  const due = billDueDate(card, month);
  const base = `A fatura de ${formatMonthLabel(month)} vence em ${formatDayMonth(due)}`;
  return due === nominal
    ? `${base}.`
    : `${base} — o dia ${formatDayMonth(nominal)} cai num fim de semana, então o pagamento passa para a segunda.`;
}
