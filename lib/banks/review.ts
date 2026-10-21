import { findCategory } from '../ai/categories';
import { foldText } from '../ai/text';
import type { CategoryOption } from '../ai/types';
import { daysBetween } from '../budget/cards';
import { previousMonth } from '../budget/date';
import { addMonthsClamped, installmentAmount, installmentDueDates } from '../budget/installments';
import { round2 } from '../budget/money';
import type { CategoryKind, Expense, Income, InstallmentPlan, Month } from '../budget/types';
import { tidyName } from './names';
import type { BankAccountKind } from './types';

/**
 * The month's check ("Conferir gastos" and "Conferir recebimentos"): what the banks sent in a
 * month, beside what is in the Capital, before anything becomes an entry. Nothing here knows where
 * a transaction came from beyond these fields, so a statement import (OFX/CSV) can go through the
 * same review later.
 */

/** A transaction as the review reads it. */
export interface ReviewTransaction {
  id: string;
  accountId: string;
  accountKind: BankAccountKind;
  /** YYYY-MM-DD. */
  date: string;
  /** As the bank sends it: on a card a purchase is positive; on an account money out is negative. */
  amount: number;
  /** CREDIT or DEBIT. */
  type: string;
  description: string;
  category: string | null;
  operationType: string | null;
  paymentMethod: string | null;
  payerName: string | null;
  /** The payer's CPF/CNPJ (the bank sends it far more often than a name): who paid an "A receber" back. */
  payerDocument?: string | null;
  receiverName: string | null;
  merchantName: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  purchaseDate: string | null;
}

/** What a transaction suggests becoming. */
export type ReviewKind = 'expense' | 'income' | 'plan';

/** Why something is left out by the app itself (the person can still launch it). */
export type IgnoreReason = 'bill_payment' | 'own_transfer' | 'investment' | 'card_credit';

export const IGNORE_LABELS: Record<IgnoreReason, string> = {
  bill_payment: 'Pagamento de fatura: as compras já contam no cartão',
  own_transfer: 'Dinheiro entre contas suas',
  investment: 'Aplicação, resgate ou rendimento de investimento',
  card_credit: 'Estorno ou crédito no cartão',
};

const INVESTMENT_CATEGORIES = new Set([
  'Investments',
  'Proceeds interests and dividends',
  'Variable income',
  'Fixed income',
  'Taxes on investments',
  'Tax on financial operations',
]);

/** Why the review leaves this out by itself, if it does. */
export function ignoreReason(transaction: ReviewTransaction): IgnoreReason | null {
  const operation = transaction.operationType ?? '';
  if (transaction.category === 'Credit card payment' || operation === 'PAGAMENTO_FATURA') return 'bill_payment';
  if (transaction.category === 'Same person transfer' || operation === 'TRANSFERENCIA_MESMA_INSTITUICAO') {
    return 'own_transfer';
  }
  if (INVESTMENT_CATEGORIES.has(transaction.category ?? '') || /APLICACAO|RESGATE|RENDIMENTO/.test(operation)) {
    return 'investment';
  }
  if (transaction.accountKind === 'card' && transaction.amount < 0) return 'card_credit';
  return null;
}

/** A purchase, a split purchase or money in. */
export function reviewKind(transaction: ReviewTransaction): ReviewKind {
  if (transaction.accountKind === 'card') {
    return (transaction.totalInstallments ?? 0) > 1 ? 'plan' : 'expense';
  }
  return transaction.type === 'CREDIT' ? 'income' : 'expense';
}

// ---------------------------------------------------------------------------
// Split purchases: one line per purchase, whatever way the bank sends the instalments
// ---------------------------------------------------------------------------

/** A purchase split in instalments, as far as the bank told it. */
export interface InstallmentGroup {
  transactions: ReviewTransaction[];
  count: number;
  /** The instalment numbers the bank sent (some send every one at once, others one a month). */
  numbers: number[];
  installmentAmount: number;
  /** The whole purchase: the sum when every instalment came, else instalment × count. */
  total: number;
  purchaseDate: string;
}

/** The description without "06/10", "PARC" and the like, so every instalment reads the same. */
export function descriptionKey(description: string): string {
  return foldText(description)
    .replace(/\b\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/g, ' ')
    .replace(/\bparc(?:ela)?s?\b/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name an entry gets from a bank description: without "06/10" and "PARC", in plain case. */
export function entryDescription(description: string): string {
  const bare = description
    .replace(/\bparc(?:ela)?s?\b\.?/gi, ' ')
    .replace(/\s*\b\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return tidyName(bare || description).slice(0, 120);
}

/** Groups the instalments of each split purchase (same card, purchase day, count and name). */
export function groupInstallments(transactions: ReviewTransaction[]): InstallmentGroup[] {
  const groups = new Map<string, ReviewTransaction[]>();
  for (const transaction of transactions) {
    const purchaseDate = transaction.purchaseDate ?? transaction.date;
    const key = [
      transaction.accountId,
      purchaseDate,
      transaction.totalInstallments,
      descriptionKey(transaction.description),
    ].join('|');
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  return [...groups.values()].map((unordered) => {
    // The first instalment first: it names the line, whatever order the bank sent them in.
    const members = [...unordered].sort((a, b) => (a.installmentNumber ?? 1) - (b.installmentNumber ?? 1));
    // The same instalment sent twice (pending, then posted with another id) counts once.
    const byNumber = new Map<number, ReviewTransaction>();
    for (const member of members) byNumber.set(member.installmentNumber ?? 1, member);
    const unique = [...byNumber.values()].sort((a, b) => (a.installmentNumber ?? 1) - (b.installmentNumber ?? 1));
    const count = members[0].totalInstallments ?? unique.length;
    // The first instalment carries the rounding cents; any other is the usual amount.
    const usual = unique.find((member) => (member.installmentNumber ?? 1) > 1) ?? unique[0];
    const installment = Math.abs(usual.amount);
    const total =
      unique.length === count
        ? round2(unique.reduce((sum, member) => sum + Math.abs(member.amount), 0))
        : round2(installment * count);
    return {
      transactions: members,
      count,
      numbers: unique.map((member) => member.installmentNumber ?? 1),
      installmentAmount: installment,
      total,
      purchaseDate: members[0].purchaseDate ?? members[0].date,
    };
  });
}

/** How many months from `from` to `to` ("2026-06" to "2026-10" is 4). */
export function monthsFrom(from: Month, to: Month): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * The instalment of a split purchase that falls in `month`, by the bank: the month of the purchase
 * plus (n − 1). It holds for both ways banks send them — one a month, dated on the bill (5/10 of a
 * purchase of 12/06 comes dated 02/10), or every one at once, dated the day after the purchase
 * (the 10 of a purchase of 10/05 all come dated 11/05), where the date says nothing. Null when the
 * purchase has none in that month.
 */
export function bankInstallmentIn(group: Pick<InstallmentGroup, 'purchaseDate' | 'count'>, month: Month): number | null {
  const number = monthsFrom(group.purchaseDate.slice(0, 7), month) + 1;
  return number >= 1 && number <= group.count ? number : null;
}

/**
 * The charge of a plan that falls in `month`, by the Capital's own due dates (the card's closing
 * day decides them): the number the bill of that month counts. Null when none does.
 */
export function planChargeIn(
  plan: Pick<InstallmentPlan, 'firstDebitDate' | 'count'>,
  month: Month,
): { number: number; dueDate: string } | null {
  const dates = installmentDueDates(plan);
  const index = dates.findIndex((date) => date.startsWith(month));
  return index < 0 ? null : { number: index + 1, dueDate: dates[index] };
}

/** The day instalment `number` stands for when the bank sent no date in its month. */
export function installmentDay(purchaseDate: string, number: number): string {
  return addMonthsClamped(purchaseDate, number - 1);
}

/**
 * The purchase already registered for this group, if any: same card (when both say one), same
 * number of instalments, the same instalment (a cent or 1% apart) and bought within 3 days.
 */
export function matchingPlan(
  group: InstallmentGroup,
  plans: InstallmentPlan[],
  cardId: string | null,
): InstallmentPlan | null {
  for (const plan of plans) {
    if (plan.count !== group.count) continue;
    if (cardId && plan.cardId && plan.cardId !== cardId) continue;
    const each = installmentAmount(plan);
    if (Math.abs(each - group.installmentAmount) > Math.max(0.05, each * 0.01)) continue;
    const bought = plan.purchaseDate ?? plan.firstDebitDate;
    if (Math.abs(daysBetween(bought, group.purchaseDate)) > 3) continue;
    return plan;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The category it suggests
// ---------------------------------------------------------------------------

export interface CategoryChoice {
  categoryKind: CategoryKind;
  topicId?: string;
}

/**
 * Pluggy's categories in the words people name their own envelopes with: a suggestion only comes
 * out when the person has a category called like one of these.
 */
const PLUGGY_CATEGORY_WORDS: Record<string, string[]> = {
  Groceries: ['mercado', 'supermercado', 'alimentação', 'comida'],
  'Eating out': ['restaurante', 'alimentação', 'comida', 'lanche'],
  'Food delivery': ['delivery', 'alimentação', 'comida', 'lanche'],
  'Gas stations': ['gasolina', 'combustível', 'carro', 'transporte'],
  'Taxi and ride-hailing': ['uber', 'transporte'],
  'Public transportation': ['transporte'],
  Parking: ['estacionamento', 'carro', 'transporte'],
  'Tolls and in vehicle payment': ['pedágio', 'carro', 'transporte'],
  Automotive: ['carro', 'veículo', 'transporte'],
  'Vehicle ownership taxes and fees': ['carro', 'impostos'],
  Pharmacy: ['farmácia', 'saúde'],
  'Hospital clinics and labs': ['saúde'],
  'Gyms and fitness centers': ['academia', 'saúde'],
  Education: ['educação', 'faculdade', 'estudos', 'conhecimentos'],
  School: ['educação', 'faculdade', 'escola', 'estudos', 'conhecimentos'],
  University: ['faculdade', 'educação', 'estudos'],
  Bookstore: ['livros', 'educação', 'conhecimentos'],
  'Video streaming': ['assinaturas', 'streaming', 'lazer'],
  'Music streaming': ['assinaturas', 'streaming', 'lazer'],
  'Digital services': ['assinaturas', 'serviços'],
  Gaming: ['jogos', 'lazer'],
  Entertainment: ['lazer'],
  Leisure: ['lazer'],
  Shopping: ['compras'],
  'Online shopping': ['compras'],
  Clothing: ['roupas', 'vestuário', 'compras'],
  Houseware: ['casa'],
  Housing: ['moradia', 'casa'],
  Rent: ['aluguel', 'moradia', 'casa'],
  Utilities: ['contas', 'casa'],
  Electricity: ['luz', 'contas', 'casa'],
  Water: ['água', 'contas', 'casa'],
  Telecommunications: ['internet', 'telefone', 'contas'],
  'Pet supplies and vet': ['pet', 'animais'],
  Travel: ['viagem', 'lazer'],
  'Airport and airlines': ['viagem'],
  Accommodation: ['viagem'],
  'Bank fees': ['tarifas', 'imprevistos'],
  'Interests charged': ['juros', 'imprevistos'],
  'Late payment and overdraft costs': ['juros', 'imprevistos'],
  Services: ['serviços'],
  Donations: ['doações'],
  Taxes: ['impostos'],
};

/**
 * Pluggy's categories by what the app's own categories mean (lib/budget/topics.ts): Diversos is
 * "os prazeres e confortos da vida", Conhecimentos "cursos, livros", Metas "viagem", and fixed
 * costs are "aluguel, contas, assinaturas". Used only while the person keeps that default category
 * (its preset), and always as a suggestion. What is not obvious (the supermarket) gets no guess.
 */
const PLUGGY_CATEGORY_PRESETS: Record<string, string> = {
  'Eating out': 'diversos',
  'Food delivery': 'diversos',
  Shopping: 'diversos',
  'Online shopping': 'diversos',
  Clothing: 'diversos',
  Gaming: 'diversos',
  Entertainment: 'diversos',
  Leisure: 'diversos',
  School: 'conhecimentos',
  University: 'conhecimentos',
  Education: 'conhecimentos',
  Bookstore: 'conhecimentos',
  Travel: 'metas',
  'Airport and airlines': 'metas',
  Accommodation: 'metas',
  'Video streaming': 'fixedCost',
  'Music streaming': 'fixedCost',
  Rent: 'fixedCost',
  Utilities: 'fixedCost',
  Electricity: 'fixedCost',
  Water: 'fixedCost',
  Telecommunications: 'fixedCost',
  'Health insurance': 'fixedCost',
};

/** A description's memory key: what the person chose before for "the same" purchase. */
export function memoryKey(description: string): string {
  return descriptionKey(description).slice(0, 60);
}

/**
 * The category to suggest, in this order: what the person chose before for the same description,
 * a category named in the description itself, Pluggy's category matched to the person's own
 * category names, and then to the default categories they kept (`presets`: preset → topic id).
 * Null when nothing fits: the person chooses ("não informado" is not guessed).
 */
export function suggestCategory(
  transaction: Pick<ReviewTransaction, 'description' | 'merchantName' | 'category'>,
  options: CategoryOption[],
  memory: Map<string, CategoryChoice>,
  presets: Record<string, string> = {},
): CategoryOption | null {
  const available = (choice: CategoryChoice) =>
    options.find(
      (option) => option.categoryKind === choice.categoryKind && (option.topicId ?? '') === (choice.topicId ?? ''),
    ) ?? null;
  const remembered = memory.get(memoryKey(transaction.description));
  if (remembered) {
    const option = available(remembered);
    if (option) return option;
  }
  const named = findCategory(`${transaction.description} ${transaction.merchantName ?? ''}`, options).option;
  if (named) return named;
  for (const word of PLUGGY_CATEGORY_WORDS[transaction.category ?? ''] ?? []) {
    const option = findCategory(word, options).option;
    if (option) return option;
  }
  const preset = PLUGGY_CATEGORY_PRESETS[transaction.category ?? ''];
  if (preset === 'fixedCost') return available({ categoryKind: 'fixedCost' });
  if (preset && presets[preset]) return available({ categoryKind: 'topic', topicId: presets[preset] });
  return null;
}

// ---------------------------------------------------------------------------
// What the screen gets
// ---------------------------------------------------------------------------

/**
 * Why a line is already in the Capital ("✓ Confere"). The pair and the plan are worked out on every
 * read, never stored: "Não é este" undoes them without deleting anything.
 */
export type ReviewMatch =
  /** Decided here: launched, tied to an entry, a payback received or a bill marked as paid. */
  | { kind: 'decided'; outcome: string; description: string | null }
  /** One manual entry with the same amount to the cent, at most a day apart (`strongPairs`). */
  | { kind: 'pair'; month: Month; entryId: string; description: string; date: string }
  /** A split purchase that is a plan of the Capital. */
  | { kind: 'plan'; planId: string; description: string };

/** One line of the month's check (a split purchase is one line: the instalment of the month). */
export interface ReviewItem {
  /** The first transaction's id: stable for the line. */
  key: string;
  /** What a decision about the line takes: the transactions nobody decided about yet (or the ignored ones). */
  transactionIds: string[];
  bankName: string;
  accountId: string;
  accountName: string;
  onCard: boolean;
  /** The Capital card this bank card is tied to (null: not tied, or "não informado"). */
  cardId: string | null;
  kind: ReviewKind;
  date: string;
  description: string;
  /** Always positive: what was spent or received (on a split purchase, the month's instalment). */
  amount: number;
  /** Who paid it, for money in. */
  payer: string | null;
  category: CategoryOption | null;
  installments: {
    count: number;
    numbers: number[];
    installmentAmount: number;
    total: number;
    purchaseDate: string;
    /** The instalment that falls in the month (the Capital's count when the purchase is a plan). */
    number: number;
  } | null;
  /** Already in the Capital ("✓ Confere"), and how. */
  match: ReviewMatch | null;
  /** A manual entry this looks like ("É o mesmo" ties them). */
  duplicate: { month: Month; entryId: string; description: string; amount: number; date: string } | null;
  /**
   * Money in that looks like an "A receber" being paid back ("Marcar como recebido"), and the other
   * open ones close enough in value ("É outro A receber").
   */
  reimbursement: (PaybackOption & { others: PaybackOption[] }) | null;
  /** Left out by the app itself, with why ("Deixados de fora"; an ignored line keeps it too). */
  leftOut: { reason: IgnoreReason; label: string } | null;
}

/** An "A receber" a Pix may pay back. */
export interface PaybackOption {
  month: Month;
  expenseId: string;
  description: string;
  amount: number;
  /**
   * The Pix minus the "A receber": above 0 the rest becomes an income, below 0 what was missing
   * becomes an expense in Imprevistos, both when the person confirms.
   */
  difference: number;
}

/** A bank card the person ties once to a Capital card (or to "não informado"). */
export interface ReviewCard {
  accountId: string;
  name: string;
  bankName: string;
  cardId: string | null;
  linked: boolean;
}

/** Where each line of one side of the month (money out or money in) stands, newest first. */
export interface ReviewSide {
  /** "Falta no Capital": what asks for a tap. */
  missing: ReviewItem[];
  /** "✓ Confere": already in the Capital. */
  matched: ReviewItem[];
  /** "Deixados de fora": left out by the app (bill payments, own transfers…); asks for nothing. */
  leftOut: ReviewItem[];
  /** "Ignorados": what the person ignored. */
  ignored: ReviewItem[];
}

export interface BankReview {
  month: Month;
  /** The months the check shows, oldest first: the one before and this one. */
  months: Month[];
  /** Money out and card purchases (a card refund stays here, left out). */
  expenses: ReviewSide;
  /** Money in to the accounts, "A receber" paid back included. */
  incomes: ReviewSide;
  cards: ReviewCard[];
}

/** How many lines of this month still ask for a tap, for the bank screen and the Início. */
export interface BankReviewCounts {
  month: Month;
  expenses: number;
  incomes: number;
}

/** The months the check shows, oldest first: the end of a month only arrives in the next one. */
export function reviewMonths(today: string): Month[] {
  const current = today.slice(0, 7);
  return [previousMonth(current), current];
}

// ---------------------------------------------------------------------------
// "Parece que você já lançou isso"
// ---------------------------------------------------------------------------

export interface LaunchedExpense {
  month: Month;
  expense: Expense;
}

/**
 * A manual entry this looks like: the same amount, within 2 days, and on the same card when both
 * say one. Instalments and entries already tied to another bank transaction don't count.
 */
export function findDuplicate(
  item: { amount: number; date: string; onCard: boolean; cardId: string | null },
  launched: LaunchedExpense[],
  taken: Set<string>,
): LaunchedExpense | null {
  for (const candidate of launched) {
    const { expense } = candidate;
    if (taken.has(expense.id) || expense.installmentId) continue;
    if (Math.abs(expense.amount - item.amount) > 0.009) continue;
    if (Math.abs(daysBetween(expense.date, item.date)) > 2) continue;
    if (item.onCard && item.cardId && expense.cardId && expense.cardId !== item.cardId) continue;
    return candidate;
  }
  return null;
}

/** A line that may be a manual entry. */
export interface PairItem {
  key: string;
  amount: number;
  date: string;
  onCard: boolean;
  cardId: string | null;
}

/** A manual entry (instalment charges and entries tied to another bank line left out). */
export interface PairEntry {
  id: string;
  amount: number;
  date: string | null;
  cardId?: string | null;
}

/**
 * "✓ Confere" without a tap: a manual entry with the same amount to the cent, at most a day apart,
 * on the same card when both say one — and the only candidate on both sides (two equal coffees on
 * the same day and one entry are no pair). Answers the entry id of each paired line. Worked out on
 * every read, never stored.
 */
export function strongPairs(items: PairItem[], entries: PairEntry[], taken: Set<string>): Map<string, string> {
  const candidates = new Map<string, string[]>();
  const claimedBy = new Map<string, number>();
  for (const item of items) {
    const found = entries.filter(
      (entry) =>
        !taken.has(entry.id) &&
        entry.date !== null &&
        Math.abs(entry.amount - item.amount) < 0.005 &&
        Math.abs(daysBetween(entry.date, item.date)) <= 1 &&
        !(item.onCard && item.cardId && entry.cardId && entry.cardId !== item.cardId),
    );
    candidates.set(item.key, found.map((entry) => entry.id));
    for (const entry of found) claimedBy.set(entry.id, (claimedBy.get(entry.id) ?? 0) + 1);
  }
  const pairs = new Map<string, string>();
  for (const [key, ids] of candidates) {
    if (ids.length === 1 && claimedBy.get(ids[0]) === 1) pairs.set(key, ids[0]);
  }
  return pairs;
}

/**
 * How far a Pix can be from an "A receber" and still be offered as paying it back: 10% of it, or
 * R$ 5 when that is more (R$ 35,67 takes a Pix from R$ 30,67 to R$ 40,67). People round.
 */
export function paybackTolerance(owed: number): number {
  return Math.max(5, round2(owed * 0.1));
}

/** The words that can say who someone is: folded, three letters or more ("Jantar — João" → jantar, joao). */
function nameWords(text: string | null | undefined): string[] {
  return foldText(text ?? '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
}

/** Who paid a Pix: their document when the bank sent one (it usually does), else their name. */
export function payerKey(payer: { payerDocument?: string | null; payerName?: string | null }): string | null {
  const document = payer.payerDocument?.trim();
  if (document) return `doc:${document}`;
  const name = nameWords(payer.payerName).join(' ');
  return name ? `name:${name}` : null;
}

/** An "A receber" the person once said a payer paid back. */
export interface PaybackHistory {
  payer: string;
  /** The description of that "A receber" ("Jantar — João"). */
  description: string;
}

/**
 * What the person taught the review, like the category memory of the expenses: for each payer,
 * the words of the "A receber" they paid back, with how often. A name keeps coming back ("joao"
 * in "Jantar — João" and "Uber — João"); what was bought changes.
 */
export function paybackMemory(history: PaybackHistory[]): Map<string, Map<string, number>> {
  const memory = new Map<string, Map<string, number>>();
  for (const { payer, description } of history) {
    const words = memory.get(payer) ?? new Map<string, number>();
    for (const word of new Set(nameWords(description))) words.set(word, (words.get(word) ?? 0) + 1);
    memory.set(payer, words);
  }
  return memory;
}

/**
 * The "A receber" a Pix received may be paying back, best first: the ones still open within
 * `paybackTolerance` of it. First the one that says who paid — the payer's name in its description
 * ("Jantar — João" for a Pix from João Silva), or the words of what this payer paid back before —
 * then the closest amount, then the most recent. Only ever a suggestion.
 */
export function reimbursementCandidates(
  item: { amount: number; payer: string | null },
  pending: LaunchedExpense[],
  taken: Set<string>,
  learned: Map<string, number> = new Map(),
): LaunchedExpense[] {
  const names = nameWords(item.payer);
  const known = (description: string) => {
    const words = new Set(nameWords(description));
    return names.filter((word) => words.has(word)).length * 100 + [...words].reduce((sum, word) => sum + (learned.get(word) ?? 0), 0);
  };
  const near = pending
    .filter(
      ({ expense }) =>
        expense.categoryKind === 'reimbursable' &&
        !expense.reimbursedAt &&
        !taken.has(expense.id) &&
        Math.abs(expense.amount - item.amount) <= paybackTolerance(expense.amount) + 0.009,
    )
    .map((candidate) => ({
      candidate,
      known: known(candidate.expense.description),
      // An exact amount is exact, whatever cents a float carries.
      off: Math.round(Math.abs(candidate.expense.amount - item.amount) * 100),
    }));
  return near
    .sort(
      (a, b) =>
        b.known - a.known || a.off - b.off || b.candidate.expense.date.localeCompare(a.candidate.expense.date),
    )
    .map(({ candidate }) => candidate);
}

/** The best of `reimbursementCandidates`, or null. */
export function findReimbursement(
  item: { amount: number; payer: string | null },
  pending: LaunchedExpense[],
  taken: Set<string>,
  learned?: Map<string, number>,
): LaunchedExpense | null {
  return reimbursementCandidates(item, pending, taken, learned)[0] ?? null;
}

/** The same for money in: an income of the same amount within 2 days. */
export function findDuplicateIncome(
  item: { amount: number; date: string },
  incomes: { month: Month; income: Income }[],
  taken: Set<string>,
): { month: Month; income: Income } | null {
  for (const candidate of incomes) {
    const { income } = candidate;
    if (taken.has(income.id) || Math.abs(income.amount - item.amount) > 0.009) continue;
    if (income.date && Math.abs(daysBetween(income.date, item.date)) > 2) continue;
    if (!income.date && candidate.month !== item.date.slice(0, 7)) continue;
    return candidate;
  }
  return null;
}
