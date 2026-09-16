import { round2 } from '../budget/money';
import { addDays, daysInMonth } from '../reminders/time';
import { optionByLabel } from './categories';
import { capitalizeFirst, foldText } from './text';
import type { CategoryOption, DraftField, ISODate } from './types';

/** "2026-09-16" → "16-09-2026", the format the bot's prompt uses. */
export function promptDate(date: ISODate): string {
  const [year, month, day] = date.split('-');
  return `${day}-${month}-${year}`;
}

function lower(label: string): string {
  return label.toLocaleLowerCase('pt-BR');
}

/** "custo fixo" → "custos fixos", to show the model that plurals still name the category. */
function plural(phrase: string): string {
  return phrase
    .split(' ')
    .map((word) => (word.length > 2 && !word.endsWith('s') ? `${word}s` : word))
    .join(' ');
}

/**
 * The bot's extraction prompt (spec §4.3, with corrections 1 and 3) built from this user's
 * own categories, up to the line where the text goes. It only changes with the categories
 * and the day, so Ollama can keep it in its cache between requests.
 */
export function buildPromptPrefix(options: CategoryOption[], today: ISODate): string {
  const names = options.map((option) => option.label).join(', ');
  const topics = options.filter((option) => option.categoryKind === 'topic');
  const fixedCost = options.find((option) => option.categoryKind === 'fixedCost');
  const reimbursable = options.find((option) => option.categoryKind === 'reimbursable');
  const first = topics[0] ?? options[0];
  const second = topics[1] ?? first;
  const last = topics.length > 2 ? topics[topics.length - 1] : second;

  const hoje = promptDate(today);
  const ontem = promptDate(addDays(today, -1));
  const anteontem = promptDate(addDays(today, -2));
  const json = (category: CategoryOption, description: string, date: string, value: string, card: boolean) =>
    `{"categoria":${JSON.stringify(category.label)},"descricao":"${description}","data":"${date}","valor":${value},"cartao":${card}}`;

  const lines = [
    'Você extrai dados de despesas de textos em português e responde SOMENTE com JSON, sem explicações.',
    `Campos: categoria (uma dessas: ${names}), descricao (até 3 palavras), data (DD-MM-YYYY), valor (número), cartao (true/false).`,
    '',
    'A descricao é o que foi comprado ou pago (ex.: almoço, uber, mercado, conta de luz). Nunca use o nome de uma pessoa, a categoria, a data ou a forma de pagamento como descricao.',
    '',
    `A data de hoje é ${hoje}.`,
    '',
    'Regras de data (IMPORTANTE):',
    `- Se o texto NÃO mencionar nenhuma palavra relacionada a tempo (como "ontem", "anteontem", dia da semana), use SEMPRE a data de hoje: ${hoje}.`,
    '- Se disser "ontem", use a data de hoje menos 1 dia.',
    '- Se disser "antes de ontem" ou "anteontem", use a data de hoje menos 2 dias.',
    '- Se disser um dia da semana, use a ocorrência mais recente desse dia, antes ou igual a hoje.',
    '',
    `A categoria sempre será mencionada explicitamente no texto (mesmo que no plural ou com pequenas variações). Sempre normalize para exatamente uma destas: ${names}.`,
    ...(reimbursable
      ? [
          `Use "${reimbursable.label}" quando outra pessoa vai devolver o dinheiro ("ressarcido", "reembolso", "vai me devolver").`,
        ]
      : []),
    '',
    'Regra do cartão: cartao é true somente se o gasto foi no cartão de crédito ("no cartão", "no crédito"). Débito, pix e dinheiro são false.',
    '',
    `Texto: "Gastei 30 reais no uber, categoria ${lower(first.label)}"`,
    `Resposta: ${json(first, 'uber', hoje, '30', false)}`,
    `Texto: "Gastei 50 reais e 30 centavos no mercado ontem no débito, categoria ${lower(second.label)}"`,
    `Resposta: ${json(second, 'mercado', ontem, '50.30', false)}`,
    ...(fixedCost
      ? [
          `Texto: "Paguei 120 e 99 de conta de luz hoje no pix, ${plural(lower(fixedCost.label))}"`,
          `Resposta: ${json(fixedCost, 'conta de luz', hoje, '120.99', false)}`,
        ]
      : []),
    `Texto: "Comprei um livro de 40 reais e 30 no cartão antes de ontem, categoria ${lower(last.label)}"`,
    `Resposta: ${json(last, 'livro', anteontem, '40.30', true)}`,
  ];
  return `${lines.join('\n')}\n`;
}

export function buildPrompt(prefix: string, text: string): string {
  return `${prefix}Texto: ${JSON.stringify(text)}\nResposta:`;
}

const FIELD_KEYS: Record<DraftField, string> = {
  category: 'categoria',
  description: 'descricao',
  date: 'data',
  amount: 'valor',
  card: 'cartao',
};
const FIELD_ORDER: DraftField[] = ['category', 'description', 'date', 'amount', 'card'];

/**
 * The JSON schema Ollama constrains the answer to: only the fields still open, in the
 * prompt's order, and the category limited to the user's names. Fewer fields means fewer
 * tokens, which is most of the wait on the Pi.
 */
export function responseSchema(fields: DraftField[], options: CategoryOption[]): Record<string, unknown> {
  const wanted = FIELD_ORDER.filter((field) => fields.includes(field));
  const properties: Record<string, unknown> = {};
  for (const field of wanted) {
    if (field === 'category') properties.categoria = { type: 'string', enum: options.map((o) => o.label) };
    if (field === 'description') properties.descricao = { type: 'string' };
    if (field === 'date') properties.data = { type: 'string' };
    if (field === 'amount') properties.valor = { type: 'number' };
    if (field === 'card') properties.cartao = { type: 'boolean' };
  }
  return { type: 'object', properties, required: wanted.map((field) => FIELD_KEYS[field]) };
}

/** Roughly how many tokens the model writes for these fields (JSON punctuation included). */
export function expectedTokens(fields: DraftField[]): number {
  const perField: Record<DraftField, number> = { category: 8, description: 7, date: 12, amount: 7, card: 5 };
  return 2 + fields.reduce((total, field) => total + perField[field], 0);
}

export interface ModelReading {
  category?: CategoryOption;
  description?: string;
  amount?: number;
  date?: ISODate;
  card?: boolean;
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  const candidates = [raw, raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)];
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value))
        return value as Record<string, unknown>;
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

/**
 * The model's answer checked field by field (spec §4.3, step 6). Anything malformed is
 * dropped rather than trusted: a category outside the user's list, a date in the future or
 * more than a year back, a zero value.
 */
export function parseModelOutput(raw: string, options: CategoryOption[], today: ISODate): ModelReading {
  const data = parseJsonObject(raw);
  if (!data) return {};
  const reading: ModelReading = {};

  if (typeof data.categoria === 'string') reading.category = optionByLabel(data.categoria, options);

  if (typeof data.descricao === 'string') {
    const description = data.descricao
      .replace(/\([^)]*\)/g, '')
      .replace(/["“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    // A category's name is not a description ("Diversos", "A receber").
    const isCategory = options.some((option) => foldText(option.label) === foldText(description));
    if (description && !isCategory) reading.description = capitalizeFirst(description);
  }

  const value =
    typeof data.valor === 'number'
      ? data.valor
      : typeof data.valor === 'string'
        ? Number(data.valor.includes(',') ? data.valor.replace(/\./g, '').replace(',', '.') : data.valor)
        : NaN;
  if (Number.isFinite(value) && value !== 0) reading.amount = round2(Math.abs(value));

  if (typeof data.data === 'string') {
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(data.data.trim());
    if (match) {
      const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
      const iso = `${match[3]}-${match[2]}-${match[1]}`;
      const exists = month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
      if (exists && iso <= today && iso >= addDays(today, -366)) reading.date = iso;
    }
  }

  if (typeof data.cartao === 'boolean') reading.card = data.cartao;
  else if (data.cartao === 'true' || data.cartao === 'false') reading.card = data.cartao === 'true';

  return reading;
}
