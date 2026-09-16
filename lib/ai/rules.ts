import { round2 } from '../budget/money';
import { addDays, daysInMonth, weekdayOf } from '../reminders/time';
import { findCategory, type CategoryReading } from './categories';
import { capitalizeFirst, foldText } from './text';
import type { CategoryOption, ISODate } from './types';

/**
 * Deterministic reading of an expense sentence. The small model on the Orange Pi is slow
 * and gets numbers wrong ("89 e 90" became 179,90 in a test), so the value, the category,
 * the date and the card are read by these rules, and the AI is only asked for what they
 * can't settle — usually just a short description.
 */

type Span = [number, number];

const NUMBER = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?`;
/** "e 30" or "e 5 centavos" after a whole amount. */
const CENTS_TAIL = String.raw`(?:\s+e\s+(?:(\d{1,2})\s*centavos?|(\d{2}))\b)?`;

interface AmountCandidate {
  value: number;
  /** 3 = said with "reais"/"R$"/"centavos"; 2 = shaped like money ("120 e 99", "89,90"); 1 = a bare number. */
  strength: number;
  span: Span;
}

function wholeValue(integer: string, decimals?: string): number {
  const units = Number(integer.replace(/\./g, ''));
  if (!decimals) return units;
  const cents = decimals.length === 1 ? Number(decimals) * 10 : Number(decimals);
  return units + cents / 100;
}

function withCents(value: number, spokenCents?: string, twoDigitCents?: string): number {
  if (spokenCents) return value + Number(spokenCents) / 100;
  if (twoDigitCents) return value + Number(twoDigitCents) / 100;
  return value;
}

function overlaps(span: Span, taken: Span[]): boolean {
  return taken.some(([start, end]) => span[0] < end && span[1] > start);
}

/** Numbers that are not money: days, dates, times, counts of instalments. */
function isNotMoney(folded: string, start: number, end: number): boolean {
  const before = folded.slice(Math.max(0, start - 6), start);
  const after = folded.slice(end, end + 10);
  return (
    /\bdia\s*$/.test(before) ||
    /[/:]$/.test(before) ||
    /^\s*(?:[/:%h]|x\b|vezes\b|parcelas?\b|de\s+(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez))/.test(
      after,
    )
  );
}

function amountCandidates(folded: string): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  const taken: Span[] = [];
  const scan = (
    source: string,
    strength: number,
    valueOf: (match: RegExpExecArray) => number | undefined,
  ) => {
    for (const match of folded.matchAll(new RegExp(source, 'g'))) {
      const span: Span = [match.index, match.index + match[0].length];
      if (overlaps(span, taken)) continue;
      const value = valueOf(match);
      if (value === undefined || !(value > 0)) continue;
      taken.push(span);
      candidates.push({ value: round2(value), strength, span });
    }
  };

  // "R$ 40", "R$ 1.200,50", "R$ 40 e 30"
  scan(String.raw`r\$\s*${NUMBER}${CENTS_TAIL}`, 3, (m) => withCents(wholeValue(m[1], m[2]), m[3], m[4]));
  // "50 reais e 30 centavos", "40 reais e 30", "12 conto"
  scan(String.raw`\b${NUMBER}\s*(?:reais|real|contos?|pilas?)\b${CENTS_TAIL}`, 3, (m) =>
    withCents(wholeValue(m[1], m[2]), m[3], m[4]),
  );
  // "50 e 30 centavos"
  scan(String.raw`\b(\d+)\s+e\s+(\d{1,2})\s*centavos?\b`, 3, (m) => Number(m[1]) + Number(m[2]) / 100);
  // "30 centavos"
  scan(String.raw`\b(\d{1,2})\s*centavos?\b`, 3, (m) => Number(m[1]) / 100);
  // "120 e 99", "89 e 90"
  scan(String.raw`\b(\d+)\s+e\s+(\d{2})\b`, 2, (m) => Number(m[1]) + Number(m[2]) / 100);
  // "89,90", "1.200,50"
  scan(String.raw`\b(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})\b`, 2, (m) => wholeValue(m[1], m[2]));
  // "gastei 30 no uber"
  scan(String.raw`\b(\d{1,3}(?:\.\d{3})+|\d+)\b`, 1, (m) =>
    isNotMoney(folded, m.index, m.index + m[0].length) ? undefined : wholeValue(m[1]),
  );
  return candidates;
}

export interface AmountReading {
  /** The value, when the text gives exactly one. */
  value?: number;
  spans: Span[];
}

/** The amount spent. Two different amounts said the same way leave it open for the AI. */
export function findAmount(text: string): AmountReading {
  const candidates = amountCandidates(foldText(text));
  const spans = candidates.map((candidate) => candidate.span);
  for (const strength of [3, 2, 1]) {
    const values = [...new Set(candidates.filter((c) => c.strength === strength).map((c) => c.value))];
    if (values.length === 1) return { value: values[0], spans };
    if (values.length > 1) return { spans };
  }
  return { spans };
}

/**
 * Whether it went on the credit card. Only credit counts ("no cartão", "no crédito"); debit,
 * pix and cash are false, and saying nothing about it is false too.
 */
export function detectCard(text: string): boolean {
  const folded = foldText(text);
  if (/\b(?:debito|pix|dinheiro|especie|boleto|transferencia)\b/.test(folded)) return false;
  return /\b(?:credito|cartao)\b/.test(folded);
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function isoDate(year: number, month: number, day: number): ISODate | undefined {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "dia 12" or "12/09": the latest such date that isn't in the future. */
function explicitDate(folded: string, today: ISODate): ISODate | undefined {
  const [year, month, day] = today.split('-').map(Number);
  const monthNames = Object.keys(MONTHS).join('|');
  const match =
    new RegExp(String.raw`\bdia\s+(\d{1,2})(?:\s*(?:/|de)\s*(\d{1,2}|${monthNames})\b)?`).exec(folded) ??
    /\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/.exec(folded);
  if (!match) return undefined;

  const wantedDay = Number(match[1]);
  if (match[2]) {
    const wantedMonth = MONTHS[match[2]] ?? Number(match[2]);
    const thisYear = isoDate(year, wantedMonth, wantedDay);
    if (thisYear && thisYear <= today) return thisYear;
    return isoDate(year - 1, wantedMonth, wantedDay);
  }
  if (wantedDay <= day) return isoDate(year, month, wantedDay);
  return month === 1 ? isoDate(year - 1, 12, wantedDay) : isoDate(year, month - 1, wantedDay);
}

/**
 * The day of the expense, as the bot's prompt defines it: today unless the text says
 * otherwise; "ontem" is −1 day, "anteontem"/"antes de ontem" −2, and a weekday is its latest
 * occurrence up to today. "segunda" alone can mean "second", so it needs "-feira" or "na".
 */
export function detectDate(text: string, today: ISODate): ISODate {
  const folded = foldText(text);
  const explicit = explicitDate(folded, today);
  if (explicit) return explicit;
  if (/\b(?:anteontem|antes\s+de\s+ontem)\b/.test(folded)) return addDays(today, -2);
  if (/\bontem\b/.test(folded)) return addDays(today, -1);

  const weekday =
    /\b(segunda|terca|quarta|quinta|sexta)[\s-]*feira\b/.exec(folded) ??
    /\b(?:na|nessa|nesta|essa|esta|ultima|na\s+ultima)\s+(segunda|terca|quarta|quinta|sexta)\b/.exec(
      folded,
    ) ??
    /\b(sabado|domingo)\b/.exec(folded);
  if (weekday) {
    const back = (weekdayOf(today) - WEEKDAYS[weekday[1]] + 7) % 7;
    return addDays(today, -back);
  }
  return today;
}

/** Words that never make a description on their own. */
const FILLER = new Set(
  (
    'gastei gasto gastou paguei pagou pago comprei comprou compra coloquei foi deu custou ' +
    'reais real conto contos pila pilas centavo centavos r valor categoria ' +
    'um uma uns umas o a os as e de da do das dos no na nos nas em com pra pro para por pelo pela ' +
    'que ele ela eu me meu minha vai vao devolver reembolsar volta ' +
    'hoje ontem anteontem antes dia semana passada passado ultima ultimo feira ' +
    'segunda terca quarta quinta sexta sabado domingo ' +
    'cartao credito debito pix dinheiro especie boleto transferencia'
  ).split(' '),
);
/** Small words allowed inside a description ("conta de luz"). */
const CONNECTORS = new Set(['de', 'da', 'do', 'e']);

/**
 * A description taken from the words themselves, for when the AI doesn't answer: the first
 * run of up to three meaningful words ("Gastei 30 reais no uber" → "Uber").
 */
export function fallbackDescription(text: string, skip: Span[]): string {
  const folded = foldText(text);
  const words = [...folded.matchAll(/[a-z0-9]+/g)].map((match) => ({
    folded: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  const isContent = (word: (typeof words)[number]) =>
    !FILLER.has(word.folded) && !/\d/.test(word.folded) && !overlaps([word.start, word.end], skip);

  const first = words.findIndex(isContent);
  if (first === -1) return '';
  let last = first;
  let count = 1;
  for (let i = first + 1; i < words.length && count < 3; i++) {
    if (isContent(words[i])) {
      last = i;
      count++;
    } else if (CONNECTORS.has(words[i].folded) && words[i + 1] && isContent(words[i + 1])) {
      continue;
    } else {
      break;
    }
  }
  return capitalizeFirst(text.slice(words[first].start, words[last].end));
}

export interface RuleReading {
  category: CategoryReading;
  amount?: number;
  date: ISODate;
  card: boolean;
  /** Only used when the AI can't be reached. */
  fallbackDescription: string;
}

export function readExpenseText(text: string, options: CategoryOption[], today: ISODate): RuleReading {
  const category = findCategory(text, options);
  const amount = findAmount(text);
  return {
    category,
    amount: amount.value,
    date: detectDate(text, today),
    card: detectCard(text),
    fallbackDescription: fallbackDescription(text, [...category.spans, ...amount.spans]),
  };
}
