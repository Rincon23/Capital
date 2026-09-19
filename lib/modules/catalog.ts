import type { ModuleKey, Month } from '../budget/types';

/** How the Mais screen (and the module list) groups modules. */
export type ModuleGroup = 'month' | 'wallet' | 'assistant';

export const MODULE_GROUPS: { key: ModuleGroup; label: string }[] = [
  { key: 'month', label: 'Dinheiro do mês' },
  { key: 'wallet', label: 'Carteira' },
  { key: 'assistant', label: 'Assistente' },
];

/** A screen that can sit in the bottom bar or in Mais. */
export interface ModuleScreen {
  /** Short label for the bottom bar, where there is only room for a word. Everywhere with
   *  room for the whole thing (Mais, the home cards, the module list) uses `name`. */
  label: string;
  href: (month: Month) => string;
  isActive: (pathname: string) => boolean;
}

/**
 * Everything the app needs to know about a module, written once: the module list, the bottom
 * bar, Mais and the home dashboard all read it. Icons and card components live in
 * `components/modules` (this file stays free of React).
 */
export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  /** One or two sentences: what the module does. */
  description: string;
  /** A few words for a menu line (Mais). */
  tagline: string;
  group: ModuleGroup;
  /** Modules that must be on before this one can be turned on. */
  dependsOn: ModuleKey[];
  /** Absent for modules that only add to other screens (the card question, the microphone). */
  screen?: ModuleScreen;
  /** Whether the home dashboard shows a card for it. */
  homeCard: boolean;
}

/**
 * Every module, in catalog order. A module always comes after the ones it depends on, which is
 * also the order of the defaults (bottom bar, Mais, home cards).
 */
export const MODULES: ModuleDefinition[] = [
  {
    key: 'expenses',
    name: 'Lançamentos',
    description: 'Registre gastos e rendas do mês e veja a lista completa, com busca.',
    tagline: 'Gastos e rendas do mês',
    group: 'month',
    dependsOn: [],
    screen: {
      label: 'Lançamentos',
      href: (month) => `/mes/${month}/lancamentos`,
      isActive: (pathname) => /^\/mes\/[^/]+\/lancamentos(\/|$)/.test(pathname),
    },
    homeCard: true,
  },
  {
    key: 'budget',
    name: 'Gastos por categoria',
    description:
      'Metas em % da renda: quanto você ainda pode gastar e quanto sobra em cada categoria, com custos fixos e imprevistos já divididos entre elas.',
    tagline: 'Metas e quanto ainda dá para gastar',
    group: 'month',
    dependsOn: ['expenses'],
    screen: {
      label: 'Categorias',
      href: (month) => `/mes/${month}/categorias`,
      // The category detail (/categoria/[id]) belongs to the same screen.
      isActive: (pathname) => /^\/mes\/[^/]+\/categorias?(\/|$)/.test(pathname),
    },
    homeCard: true,
  },
  {
    key: 'card',
    name: 'Cartão de crédito',
    description: 'Marque as compras feitas no cartão e acompanhe quanto vai vir na fatura do mês.',
    tagline: 'Compras no cartão e a fatura do mês',
    group: 'month',
    dependsOn: ['expenses'],
    homeCard: true,
  },
  {
    key: 'reimbursable',
    name: 'A receber',
    description:
      'Para compras no cartão que outra pessoa vai te devolver: entram na fatura, mas não gastam nenhuma categoria.',
    tagline: 'Compras no cartão que alguém vai devolver',
    group: 'month',
    dependsOn: ['card'],
    homeCard: true,
  },
  {
    key: 'history',
    name: 'Histórico e gráficos',
    description:
      'Sua evolução mês a mês: aderência à meta, gráficos de gasto e sobra e a tabela de cada mês.',
    tagline: 'Sua evolução mês a mês',
    group: 'month',
    dependsOn: ['budget'],
    screen: {
      label: 'Histórico',
      href: () => '/historico',
      isActive: (pathname) => pathname.startsWith('/historico'),
    },
    homeCard: true,
  },
  {
    key: 'recurring',
    name: 'Gastos recorrentes',
    description: 'Modelos dos gastos que se repetem todo mês, lançados com um toque.',
    tagline: 'Gastos que se repetem todo mês',
    group: 'wallet',
    dependsOn: ['expenses'],
    screen: {
      label: 'Recorrentes',
      href: () => '/carteira/recorrentes',
      isActive: (pathname) => pathname.startsWith('/carteira/recorrentes'),
    },
    homeCard: true,
  },
  {
    key: 'installments',
    name: 'Parcelados',
    description: 'Compras parceladas no cartão, com a parcela do mês lançada automaticamente.',
    tagline: 'Compras parceladas no cartão',
    group: 'wallet',
    dependsOn: ['expenses', 'card'],
    screen: {
      label: 'Parcelados',
      href: () => '/carteira/parcelados',
      isActive: (pathname) => pathname.startsWith('/carteira/parcelados'),
    },
    homeCard: true,
  },
  {
    key: 'investments',
    name: 'Reserva investida',
    description:
      'Sua reserva em cotas, separada em categorias da reserva. Remanejar para uma delas lança o gasto na categoria do orçamento.',
    tagline: 'Cotas, cotação e categorias da reserva',
    group: 'wallet',
    dependsOn: ['expenses'],
    screen: {
      label: 'Investida',
      href: () => '/carteira/reserva',
      isActive: (pathname) => pathname.startsWith('/carteira/reserva'),
    },
    homeCard: true,
  },
  {
    key: 'cash',
    name: 'Reserva de emergência',
    description:
      'Quanto você tem, quanto deve no cartão e nos parcelados e quanto falta para a reserva de emergência.',
    tagline: 'Reserva, dívidas e o que falta',
    group: 'wallet',
    dependsOn: [],
    screen: {
      label: 'Emergência',
      href: () => '/carteira/caixa',
      isActive: (pathname) => pathname.startsWith('/carteira/caixa'),
    },
    homeCard: true,
  },
  {
    key: 'reminders',
    name: 'Lembretes',
    description: 'Lembretes e tarefas do dia, no horário que você escolher, com notificação no celular.',
    tagline: 'Tarefas e compromissos com aviso',
    group: 'assistant',
    dependsOn: [],
    screen: {
      label: 'Lembretes',
      href: () => '/lembretes',
      isActive: (pathname) => pathname.startsWith('/lembretes'),
    },
    homeCard: true,
  },
  {
    key: 'voice',
    name: 'Lançar por voz ou texto',
    description:
      'Fale ou escreva o gasto e a IA do servidor monta o lançamento para você conferir antes de salvar.',
    tagline: 'O botão de microfone ao lançar gasto',
    group: 'assistant',
    dependsOn: ['expenses'],
    homeCard: false,
  },
  {
    key: 'gmail',
    name: 'Monitor de Gmail',
    description: 'Avisa no celular quando chega um e-mail com uma das suas palavras-chave.',
    tagline: 'Avisos de e-mails com as suas palavras-chave',
    group: 'assistant',
    dependsOn: [],
    screen: {
      label: 'Gmail',
      href: () => '/gmail',
      isActive: (pathname) => pathname.startsWith('/gmail'),
    },
    homeCard: true,
  },
];

export const MODULE_KEYS: ModuleKey[] = MODULES.map((definition) => definition.key);

const BY_KEY = new Map(MODULES.map((definition) => [definition.key, definition]));

export function moduleDefinition(key: ModuleKey): ModuleDefinition {
  const found = BY_KEY.get(key);
  if (!found) throw new Error(`Módulo desconhecido: ${key}`);
  return found;
}

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === 'string' && BY_KEY.has(value as ModuleKey);
}

/** "Lançamentos", "Lançamentos e Cartão de crédito", "A, B e C". */
export function moduleNames(keys: ModuleKey[]): string {
  const names = keys.map((key) => moduleDefinition(key).name);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
