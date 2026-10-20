import { formatBRL, round2 } from '../budget/money';
import type { BankAccountKind } from './types';

/**
 * Open Finance alerts: one summary per bank each time new data arrives. Honest about the delay:
 * the banks send data once a day, so nothing here says "agora" — things "chegaram".
 */

/** What to tell about, set in the module's gear. */
export interface BankAlertSettings {
  purchases: boolean;
  pixSent: boolean;
  pixReceived: boolean;
  /** Only amounts from this much up (null: everything). */
  minAmount: number | null;
}

export const DEFAULT_BANK_ALERTS: BankAlertSettings = {
  purchases: true,
  pixSent: true,
  pixReceived: true,
  minAmount: null,
};

/** The settings as saved, keeping only what still exists (older ones may carry more). */
export function alertSettingsOf(saved: Partial<BankAlertSettings> | null | undefined): BankAlertSettings {
  const flag = (key: 'purchases' | 'pixSent' | 'pixReceived') =>
    typeof saved?.[key] === 'boolean' ? saved[key] : DEFAULT_BANK_ALERTS[key];
  return {
    purchases: flag('purchases'),
    pixSent: flag('pixSent'),
    pixReceived: flag('pixReceived'),
    minAmount: typeof saved?.minAmount === 'number' && saved.minAmount > 0 ? saved.minAmount : null,
  };
}

/** A transaction as the alerts read it. */
export interface AlertTransaction {
  id: string;
  accountKind: BankAccountKind;
  amount: number;
  /** CREDIT or DEBIT. */
  type: string;
  description: string;
  paymentMethod: string | null;
  operationType: string | null;
  category: string | null;
}

export type ArrivalKind = 'purchase' | 'pixSent' | 'pixReceived' | 'other';

const OWN_TRANSFER = 'Same person transfer';
const BILL_PAYMENT = 'Credit card payment';

/**
 * What a transaction is, for the summary. A card purchase is positive on the card (Pluggy's sign);
 * a bill payment, a refund or money moved between the person's own accounts is none of these.
 */
export function arrivalKind(transaction: AlertTransaction): ArrivalKind {
  if (transaction.category === OWN_TRANSFER || transaction.category === BILL_PAYMENT) return 'other';
  if (transaction.accountKind === 'card') {
    const payment = transaction.operationType === 'PAGAMENTO_FATURA' || transaction.operationType === 'ESTORNO';
    return transaction.amount > 0 && !payment ? 'purchase' : 'other';
  }
  const pix = transaction.paymentMethod === 'PIX' || transaction.operationType === 'PIX';
  if (!pix) return 'other';
  return transaction.type === 'CREDIT' ? 'pixReceived' : 'pixSent';
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/**
 * What one bank's new transactions add up to, under the person's settings: "Chegaram 3 compras no
 * cartão (R$ 120,00) e 1 Pix recebido (R$ 50,00)." Null when there is nothing to tell.
 */
export function summarizeArrivals(transactions: AlertTransaction[], settings: BankAlertSettings): string | null {
  const totals: Record<Exclude<ArrivalKind, 'other'>, { count: number; sum: number }> = {
    purchase: { count: 0, sum: 0 },
    pixSent: { count: 0, sum: 0 },
    pixReceived: { count: 0, sum: 0 },
  };
  for (const transaction of transactions) {
    if (settings.minAmount !== null && Math.abs(transaction.amount) < settings.minAmount) continue;
    const kind = arrivalKind(transaction);
    if (kind === 'other') continue;
    totals[kind].count += 1;
    totals[kind].sum = round2(totals[kind].sum + Math.abs(transaction.amount));
  }
  const parts: string[] = [];
  let count = 0;
  const tell = (on: boolean, { count: n, sum }: { count: number; sum: number }, one: string, many: string) => {
    if (!on || n === 0) return;
    count += n;
    parts.push(`${plural(n, one, many)} (${formatBRL(sum)})`);
  };
  tell(settings.purchases, totals.purchase, 'compra no cartão', 'compras no cartão');
  tell(settings.pixSent, totals.pixSent, 'Pix enviado', 'Pix enviados');
  tell(settings.pixReceived, totals.pixReceived, 'Pix recebido', 'Pix recebidos');
  if (parts.length === 0) return null;
  return `${count === 1 ? 'Chegou' : 'Chegaram'} ${joinParts(parts)}.`;
}
