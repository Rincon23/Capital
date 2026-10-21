import type { ModuleKey, Month } from '../budget/types';

/** A sheet the tour opens for a step (and closes when it moves on). */
export type TourSheet = 'expense-form' | 'expense-form-reimbursable' | 'voice';

/** One stop of a module's tour. */
export interface TourStepDefinition {
  /** The screen the step happens on. */
  route: (month: Month) => string;
  /** The `data-tour` anchor it highlights. It must exist even in an account with no data. */
  anchor: string;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Opened before the step is shown, e.g. the expense form for the card question. */
  sheet?: TourSheet;
  /** Only shown while this other module is on (its part of the screen only exists then). */
  requires?: ModuleKey;
}

const home = (month: Month) => `/mes/${month}`;
const entries = (month: Month) => `/mes/${month}/lancamentos`;
const categories = (month: Month) => `/mes/${month}/categorias`;
const card = () => '/cartao';

/**
 * The tour of every module (a `Record`, so a module without a tour does not compile): at most four
 * steps, each with a one-line description (a test holds both). Steps point at the module's own
 * screen (or its widget on the Início, which the Início brings into view), never at the up-arrow
 * or the trays of the Início, which are not the module's. Every tour then ends on its help button.
 */
export const MODULE_TOURS: Record<ModuleKey, TourStepDefinition[]> = {
  expenses: [
    {
      route: entries,
      anchor: 'lancamentos-abas',
      title: 'Tudo o que entrou e saiu',
      description: 'Gastos e Renda do mês. Toque num lançamento para editar ou excluir.',
      side: 'bottom',
    },
    {
      route: entries,
      anchor: 'lancamentos-busca',
      title: 'Busca e filtro',
      description: 'Procure pela descrição ou filtre por categoria.',
      side: 'bottom',
    },
    {
      route: entries,
      anchor: 'fab-lancar-gasto',
      title: 'Lançar gasto',
      description: 'Toque aqui sempre que gastar: valor, categoria e pronto.',
      side: 'top',
    },
    {
      route: entries,
      anchor: 'fab-renda',
      title: 'Registrar renda',
      description: 'Salário, freela ou qualquer dinheiro que entrou.',
      side: 'top',
    },
  ],
  budget: [
    {
      route: categories,
      anchor: 'categorias',
      title: 'Suas categorias',
      description: 'Cada uma recebe uma % da renda e mostra quanto ainda dá nela. Toque para ver.',
      side: 'top',
    },
    {
      route: categories,
      anchor: 'custos-fixos',
      title: 'Custos fixos e imprevistos',
      description: 'Não têm limite próprio: saem de cada categoria, na proporção da %.',
      side: 'top',
    },
    {
      route: categories,
      anchor: 'fechar-mes',
      title: 'Fechar o mês',
      description: 'Leva a sobra (ou o que passou) de cada categoria para o mês seguinte.',
      side: 'top',
    },
  ],
  card: [
    {
      route: card,
      anchor: 'cartao-fatura',
      title: 'A fatura do mês',
      description: 'Quanto vem e quando vence. Ela só sai quando você tocar em Fatura paga.',
      side: 'bottom',
    },
    {
      route: () => `${card()}?aba=parcelados`,
      anchor: 'cartao-aba-parcelados',
      title: 'Parcelados',
      description: 'O que falta de cada compra parcelada, e "Adiantar parcelas".',
      side: 'bottom',
    },
    {
      route: () => `${card()}?aba=cartoes`,
      anchor: 'cartao-aba-cartoes',
      title: 'Seus cartões',
      description: 'Nome, dia do vencimento, aviso e, se quiser, o limite de cada cartão.',
      side: 'bottom',
    },
    {
      route: home,
      anchor: 'cartao-pergunta',
      title: 'Foi no cartão?',
      description: 'Ao lançar um gasto, toque em Cartão quando pagar no crédito.',
      side: 'bottom',
      sheet: 'expense-form',
    },
  ],
  reimbursable: [
    {
      route: home,
      anchor: 'categoria-a-receber',
      title: 'Uma compra para outra pessoa',
      description: 'Escolha A receber quando alguém vai te devolver: não gasta categoria.',
      side: 'top',
      sheet: 'expense-form-reimbursable',
    },
    {
      route: (month) => `${entries(month)}?aba=a-receber`,
      anchor: 'aba-a-receber',
      title: 'O filtro A receber',
      description: 'Em Lançamentos, veja quem ainda precisa te pagar.',
      side: 'bottom',
    },
    {
      route: home,
      anchor: 'card-reimbursable',
      title: 'Quanto volta para você',
      description: 'O total que ainda te devem. Não é gasto seu.',
      side: 'top',
    },
  ],
  history: [
    {
      route: () => '/historico?aba=gastos',
      anchor: 'historico-mes',
      title: 'Mês a mês',
      description: 'Quanto você gastou e a sua renda. Toque numa barra para ver outro mês.',
      side: 'bottom',
    },
    {
      route: () => '/historico?aba=gastos',
      anchor: 'historico-categorias',
      title: 'Cada categoria',
      description: 'Quanto você gastou do limite de cada uma no mês escolhido.',
      side: 'top',
    },
    {
      route: () => '/historico?aba=gastos',
      anchor: 'historico-evolucao',
      title: 'Ao longo do tempo',
      description: 'Escolha uma categoria e veja o gasto ou a sobra de cada mês.',
      side: 'top',
    },
    {
      route: () => '/historico?aba=investimentos',
      anchor: 'historico-investimentos',
      title: 'Seus investimentos',
      description: 'A subida e a descida da carteira no período. Filtre por tipo.',
      side: 'bottom',
      requires: 'diagram',
    },
  ],
  recurring: [
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-lista',
      title: 'As contas do mês',
      description: 'O que falta lançar vem primeiro. Lançar abre o gasto já preenchido.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-mes',
      title: 'Outro mês',
      description: 'Deslize para o lado ou use as setas para ver as contas de outro mês.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-novo',
      title: 'Nova conta',
      description: 'Valor, categoria, dia do vencimento e se é paga no cartão.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-config',
      title: 'Aviso no celular',
      description: 'Na engrenagem: o horário do aviso no dia em que a conta vence.',
      side: 'bottom',
    },
  ],
  cash: [
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-gap',
      title: 'Sua reserva',
      description: 'Quanto você tem, já sem as dívidas, e quanto falta para a meta.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-detalhes',
      title: 'Ver detalhes',
      description: 'Reserva em conta, investida e as dívidas do cartão e dos parcelados.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/caixa?aba=investida',
      anchor: 'reserva-valor',
      title: 'Reserva investida',
      description: 'Suas cotas e a cotação. Guardar numa categoria lança o gasto no orçamento.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-config',
      title: 'Configurar a reserva',
      description: 'Na engrenagem: o que tem em conta, os meses da meta e o ativo das cotas.',
      side: 'bottom',
    },
  ],
  diagram: [
    {
      route: () => '/diagrama',
      anchor: 'diagrama-valor',
      title: 'Quanto você quer investir?',
      description: 'Digite e toque em Calcular: vai primeiro para quem está mais longe da meta.',
      side: 'bottom',
    },
    {
      route: () => '/diagrama',
      anchor: 'diagrama-carteira',
      title: 'Sua carteira por tipo',
      description: 'Quanto cada tipo pesa hoje e a meta dele.',
      side: 'top',
    },
    {
      route: () => '/diagrama?aba=ativos',
      anchor: 'diagrama-ativos',
      title: 'Ativos e notas',
      description: 'Nota de −10 a 10 pelas perguntas: quanto maior, mais o ativo recebe.',
      side: 'top',
    },
    {
      route: () => '/diagrama',
      anchor: 'diagrama-config',
      title: 'Tipos e metas',
      description: 'Na engrenagem, os tipos da carteira e quanto cada um deve pesar.',
      side: 'bottom',
    },
  ],
  reminders: [
    {
      route: () => '/lembretes',
      anchor: 'lembretes-abas',
      title: 'Hoje, Todos e Calendário',
      description: 'O atrasado e o que vence hoje. Toque no círculo para marcar como feito.',
      side: 'bottom',
    },
    {
      route: () => '/lembretes',
      anchor: 'lembretes-novo',
      title: 'Novo lembrete',
      description: 'Uma vez, todo dia, toda semana ou todo mês, no horário que quiser.',
      side: 'top',
    },
    {
      route: () => '/lembretes',
      anchor: 'lembretes-config',
      title: 'Avisos no celular',
      description: 'Na engrenagem você ativa as notificações neste aparelho.',
      side: 'bottom',
    },
  ],
  voice: [
    {
      route: home,
      anchor: 'fab-voz',
      title: 'O microfone',
      description: 'Toque aqui para lançar um gasto falando ou escrevendo.',
      side: 'top',
    },
    {
      route: home,
      anchor: 'voz-gravar',
      title: 'Fale o gasto',
      description: 'Diga a categoria, o valor e o que foi.',
      side: 'top',
      sheet: 'voice',
    },
    {
      route: home,
      anchor: 'voz-escrever',
      title: 'Ou escreva',
      description: 'A IA monta o gasto para você conferir; nada é salvo sem confirmar.',
      side: 'top',
      sheet: 'voice',
    },
  ],
  gmail: [
    {
      route: () => '/gmail',
      anchor: 'gmail-conta',
      title: 'Sua conta',
      description: 'Conecte seu Gmail só com permissão de leitura.',
      side: 'bottom',
    },
    {
      route: () => '/gmail',
      anchor: 'gmail-palavras',
      title: 'Palavras-chave',
      description: 'Chegou e-mail com uma delas? O celular avisa.',
      side: 'top',
    },
    {
      route: () => '/gmail',
      anchor: 'gmail-alertas',
      title: 'Alertas',
      description: 'Os e-mails encontrados. Toque em um para abrir no Gmail.',
      side: 'top',
    },
    {
      route: () => '/gmail',
      anchor: 'gmail-config',
      title: 'Avisos no celular',
      description: 'Na engrenagem você ativa as notificações neste aparelho.',
      side: 'bottom',
    },
  ],
  banks: [
    {
      route: () => '/bancos',
      anchor: 'bancos-conexoes',
      title: 'Seus bancos',
      description: 'Traga um banco por vez do Meu Pluggy; depois, confira aqui o mês com o que você lançou.',
      side: 'bottom',
    },
    {
      route: () => '/bancos',
      anchor: 'bancos-uma-vez-por-dia',
      title: 'Uma vez por dia',
      description: 'Os bancos mandam os dados uma vez por dia; o Capital não consegue pedir antes.',
      side: 'top',
    },
    {
      route: () => '/bancos',
      anchor: 'bancos-config',
      title: 'Avisos e chave',
      description: 'Na engrenagem: o que avisar no celular e a sua chave.',
      side: 'bottom',
    },
  ],
};

/**
 * Where each module's help button is (`data-tour="ajuda-<module>"`): the header of its screen,
 * or the place a module without a screen shows up. Every tour ends there, so the person learns
 * how to see it again.
 */
export const MODULE_HELP: Record<ModuleKey, Pick<TourStepDefinition, 'route' | 'sheet'>> = {
  expenses: { route: entries },
  budget: { route: categories },
  card: { route: card },
  reimbursable: { route: (month) => `${entries(month)}?aba=a-receber` },
  history: { route: () => '/historico' },
  recurring: { route: () => '/carteira/recorrentes' },
  cash: { route: () => '/carteira/caixa' },
  diagram: { route: () => '/diagrama' },
  reminders: { route: () => '/lembretes' },
  voice: { route: home, sheet: 'voice' },
  gmail: { route: () => '/gmail' },
  banks: { route: () => '/bancos' },
};

export const helpAnchor = (key: ModuleKey) => `ajuda-${key}`;

export interface TourStep extends Omit<TourStepDefinition, 'route'> {
  href: string;
  /** The module the step explains; none for the Início's own tour (organizing the telas). */
  module?: ModuleKey;
}

/**
 * The steps of these modules' tours, one after the other, with the routes for `month`, leaving out
 * the steps whose other module is off (`isOn`). Each module's part ends on its help button.
 */
export function tourSteps(
  keys: ModuleKey[],
  month: Month,
  isOn: (key: ModuleKey) => boolean = () => true,
): TourStep[] {
  return keys.flatMap((key) => [
    ...MODULE_TOURS[key]
      .filter((step) => !step.requires || isOn(step.requires))
      .map(({ route, ...step }) => ({ ...step, href: route(month), module: key })),
    {
      href: MODULE_HELP[key].route(month),
      sheet: MODULE_HELP[key].sheet,
      anchor: helpAnchor(key),
      title: 'Ficou alguma dúvida?',
      description: 'Toque aqui quando quiser ver esta explicação de novo.',
      side: 'bottom' as const,
      module: key,
    },
  ]);
}

/** The help button next to the pencil of the Início, where its tour ends. */
export const HOME_HELP_ANCHOR = 'ajuda-inicio';

/**
 * "Como organizar a Início": the Início is put in edit mode first, then this walks through the
 * real controls — the widget to hold and drag (and its − and Mover), the widget tray and the ✓.
 * Same rules as a module's tour: at most four steps, one line each, then the help button.
 */
export const HOME_EDIT_TOUR: Omit<TourStepDefinition, 'route'>[] = [
  {
    anchor: 'inicio-widget',
    title: 'Segure e arraste',
    description: 'Segure um widget e arraste para mudar de lugar. Até a borda, ele vai para a outra tela.',
    side: 'bottom',
  },
  {
    anchor: 'inicio-widget',
    title: 'Tirar ou mover',
    description: 'O − tira o widget da Início e o Mover leva para outra tela, sem arrastar.',
    side: 'bottom',
  },
  {
    anchor: 'inicio-bandeja',
    title: 'Bandeja de widgets',
    description: 'Os que você tirou ficam aqui. Toque num para pôr de volta na tela.',
    side: 'top',
  },
  {
    anchor: 'inicio-concluir',
    title: 'Pronto',
    description: 'Deslize até o fim para criar uma tela nova. Toque aqui quando terminar.',
    side: 'bottom',
  },
];

/** The Início's tour on the screen it is on (`href`, the Início's own address), ending on its help. */
export function homeEditTourSteps(href: string): TourStep[] {
  return [
    ...HOME_EDIT_TOUR.map((step) => ({ ...step, href })),
    {
      href,
      anchor: HOME_HELP_ANCHOR,
      title: 'Ficou alguma dúvida?',
      description: 'Toque aqui quando quiser ver esta explicação de novo.',
      side: 'bottom' as const,
    },
  ];
}
