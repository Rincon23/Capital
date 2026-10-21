import type { ModuleKey, Month } from '../budget/types';

/** How the app drawer (and the module list) groups modules. */
export type ModuleGroup = 'month' | 'wallet' | 'investing' | 'assistant';

export const MODULE_GROUPS: { key: ModuleGroup; label: string }[] = [
  { key: 'month', label: 'Dinheiro do mês' },
  { key: 'wallet', label: 'Carteira' },
  { key: 'investing', label: 'Investimentos' },
  { key: 'assistant', label: 'Assistente' },
];

/** A module's own screen, opened from the app drawer (and from its widget on the Início). */
export interface ModuleScreen {
  /** Short label, for where there is only room for a word. Everywhere with room for the whole
   *  thing (the app drawer, the home cards, the module list) uses `name`. */
  label: string;
  href: (month: Month) => string;
  isActive: (pathname: string) => boolean;
}

/**
 * Everything the app needs to know about a module, written once: the module list, the app
 * drawer and the Início all read it. Icons and card components live in
 * `components/modules` (this file stays free of React).
 */
export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  /** One or two sentences: what the module does. */
  description: string;
  /** A few words for a menu line (the app drawer, the widget tray). */
  tagline: string;
  group: ModuleGroup;
  /** Modules that must be on before this one can be turned on. */
  dependsOn: ModuleKey[];
  /** Absent for modules that only add to other screens (the card question, the microphone). */
  screen?: ModuleScreen;
  /** Whether the home dashboard shows a card for it. */
  homeCard: boolean;
  /**
   * Starts as only for VIP accounts. The owner changes it in Administração ("Só VIP", saved in
   * `module_access`); everything reads that choice (`vipModules`), never this field directly.
   */
  vipByDefault?: boolean;
}

/**
 * Every module, in catalog order. A module always comes after the ones it depends on, which is
 * also the order of the defaults (the app drawer and the Início widgets).
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
    name: 'Cartão',
    description:
      'Tudo do cartão num lugar só: marque a compra como feita no cartão, escolha o cartão (ou não informe), parcele quando quiser e acompanhe a fatura de cada mês, com o dia do vencimento, o botão de fatura paga e aviso no celular.',
    tagline: 'Compras, parcelamento e a fatura de cada mês',
    group: 'month',
    dependsOn: ['expenses'],
    screen: {
      label: 'Cartão',
      href: () => '/cartao',
      isActive: (pathname) => pathname.startsWith('/cartao'),
    },
    homeCard: true,
  },
  {
    key: 'reimbursable',
    name: 'A receber',
    description:
      'Para o dinheiro que saiu por outra pessoa e que ela vai te devolver: no cartão ou não, não gasta nenhuma categoria.',
    tagline: 'O que alguém vai te devolver',
    group: 'month',
    // Not only card purchases: lending R$ 50 in cash is the same thing, so it only needs Lançamentos.
    dependsOn: ['expenses'],
    homeCard: true,
  },
  {
    key: 'history',
    name: 'Histórico e gráficos',
    description:
      'Sua evolução mês a mês: quanto você gastou, cada categoria ao longo do tempo e, com o Diagrama ligado, a subida e a descida dos seus investimentos.',
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
    name: 'Contas do mês',
    description:
      'As contas de todo mês, como aluguel, luz e internet: o que falta lançar, o dia de cada uma e um aviso no celular quando vence.',
    tagline: 'O que falta pagar este mês',
    group: 'wallet',
    dependsOn: ['expenses'],
    screen: {
      label: 'Contas',
      href: () => '/carteira/recorrentes',
      isActive: (pathname) => pathname.startsWith('/carteira/recorrentes'),
    },
    homeCard: true,
  },
  {
    key: 'cash',
    name: 'Reserva',
    // One module for what used to be two ("Reserva de emergência" and "Reserva investida"): to the
    // person it is a single thing, their reserve, with two tabs.
    description:
      'Sua reserva de emergência, já sem as dívidas do cartão, e quanto falta para a meta. Na aba Investida, as cotas que você guarda e as categorias da reserva.',
    tagline: 'Quanto você tem e quanto falta',
    group: 'wallet',
    dependsOn: [],
    screen: {
      label: 'Reserva',
      href: () => '/carteira/caixa',
      isActive: (pathname) => pathname.startsWith('/carteira/caixa'),
    },
    homeCard: true,
  },
  {
    key: 'banks',
    name: 'Open Finance',
    description:
      'Traz seus bancos e cartões para o Capital pelo Meu Pluggy, de graça e só para leitura. Os bancos mandam os dados uma vez por dia.',
    tagline: 'Seus bancos no Capital, uma vez por dia',
    group: 'wallet',
    dependsOn: [],
    screen: {
      label: 'Bancos',
      href: () => '/bancos',
      isActive: (pathname) => pathname.startsWith('/bancos'),
    },
    homeCard: true,
    // Each person brings their own free Meu Pluggy key; the owner tries it first.
    vipByDefault: true,
  },
  {
    key: 'diagram',
    name: 'Diagrama',
    description:
      'Diga quanto quer investir e veja quanto vai para cada tipo e cada ativo, em reais e em cotas, pelas suas metas e pelas notas que você dá aos ativos.',
    tagline: 'Quanto aportar em cada ativo',
    group: 'investing',
    dependsOn: [],
    screen: {
      label: 'Diagrama',
      href: () => '/diagrama',
      isActive: (pathname) => pathname.startsWith('/diagrama'),
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
    // The AI runs on the server's own board: kept to a few accounts so it doesn't overheat.
    vipByDefault: true,
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
