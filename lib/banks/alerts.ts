import { formatBRL, round2 } from '../budget/money';
import type { BankAccountKind } from './types';

/**
 * Open Finance alerts: one summary per bank each time new data arrives, and an alert of its own
 * when the salary comes in. Honest about the delay: the banks send data once a day, so nothing
 * here says "agora" — things "chegaram".
 */

/** A salary the person pointed at: the next credits like it are their salary too. */
export interface SalaryRef {
  /** The transaction they picked (to show it ticked). */
  transactionId: string;
  payerDocument: string | null;
  payerName: string | null;
  description: string;
  amount: number;
}

/** A recent credit the person can point at as their salary. */
export interface SalaryCandidate {
  transactionId: string;
  date: string;
  amount: number;
  description: string;
  payerName: string | null;
  payerDocument: string | null;
  bankName: string;
  /** The bank itself called it a salary (portabilidade de salário): shown first, never ticked for them. */
  likely: boolean;
}

/** What to tell about, set in the module's gear. */
export interface BankAlertSettings {
  purchases: boolean;
  pixSent: boolean;
  pixReceived: boolean;
  salary: boolean;
  /** Only amounts from this much up (null: everything). */
  minAmount: number | null;
  salaries: SalaryRef[];
}

export const DEFAULT_BANK_ALERTS: BankAlertSettings = {
  purchases: true,
  pixSent: true,
  pixReceived: true,
  salary: true,
  minAmount: null,
  salaries: [],
};

/** A salary within this much of the one the person pointed at counts (a raise, a discount). */
export const SALARY_TOLERANCE = 0.15;

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
  payerName: string | null;
  payerDocument: string | null;
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

/** Letters and spaces only, lower case, without accents: "PIX RECEBIDO - EMPRESA 123" ≈ "pix recebido empresa". */
function normalize(text: string | null): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The salary a credit looks like (same payer, amount within 15%), if any. */
export function salaryMatch(transaction: AlertTransaction, salaries: SalaryRef[]): SalaryRef | null {
  if (transaction.accountKind === 'card' || transaction.type !== 'CREDIT' || transaction.amount <= 0) return null;
  for (const ref of salaries) {
    if (Math.abs(transaction.amount - ref.amount) > ref.amount * SALARY_TOLERANCE) continue;
    const samePayer =
      transaction.payerDocument && ref.payerDocument
        ? transaction.payerDocument === ref.payerDocument
        : transaction.payerName && ref.payerName
          ? normalize(transaction.payerName) === normalize(ref.payerName)
          : normalize(transaction.description) === normalize(ref.description);
    if (samePayer) return ref;
  }
  return null;
}

export interface ArrivalSummary {
  /** "Chegaram 3 compras no cartão (R$ 120,00) e 1 Pix recebido (R$ 50,00)." Null: nothing to tell. */
  body: string | null;
  /** The credits that look like the salary (their own alert, left out of the summary). */
  salaries: AlertTransaction[];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** What one bank's new transactions add up to, under the person's settings. */
export function summarizeArrivals(transactions: AlertTransaction[], settings: BankAlertSettings): ArrivalSummary {
  const big = (transaction: AlertTransaction) =>
    settings.minAmount === null || Math.abs(transaction.amount) >= settings.minAmount;
  const salaries = settings.salary
    ? transactions.filter((transaction) => big(transaction) && salaryMatch(transaction, settings.salaries))
    : [];
  const totals: Record<Exclude<ArrivalKind, 'other'>, { count: number; sum: number }> = {
    purchase: { count: 0, sum: 0 },
    pixSent: { count: 0, sum: 0 },
    pixReceived: { count: 0, sum: 0 },
  };
  for (const transaction of transactions) {
    if (!big(transaction) || salaries.includes(transaction)) continue;
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
  if (parts.length === 0) return { body: null, salaries };
  return { body: `${count === 1 ? 'Chegou' : 'Chegaram'} ${joinParts(parts)}.`, salaries };
}
