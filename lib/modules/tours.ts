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
      anchor: 'posso-gastar',
      title: 'Ainda posso gastar',
      description: 'Quanto ainda dá para gastar neste mês, somando as categorias.',
      side: 'bottom',
    },
    {
      route: categories,
      anchor: 'categorias',
      title: 'Suas categorias',
      description: 'Cada uma recebe uma % da renda. Toque numa para ver a conta e os gastos.',
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
      description: 'O total a receber. Entra na fatura, mas não é gasto seu.',
      side: 'top',
    },
  ],
  history: [
    {
      route: () => '/historico',
      anchor: 'historico-aderencia',
      title: 'Dentro do planejado',
      description: 'Quanto do limite de cada categoria você usou no último mês.',
      side: 'bottom',
    },
    {
      route: () => '/historico',
      anchor: 'historico-graficos',
      title: 'Gráficos',
      description: 'Gasto por categoria, composição do mês e sobra de um mês para o outro.',
      side: 'top',
    },
    {
      route: () => '/historico',
      anchor: 'historico-tabela',
      title: 'Mês a mês',
      description: 'Os números de cada categoria. Use as setas para trocar de mês.',
      side: 'top',
    },
  ],
  recurring: [
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-lista',
      title: 'Seus gastos de todo mês',
      description: 'Cada um vira um modelo. Lançar abre o gasto já preenchido.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-novo',
      title: 'Novo modelo',
      description: 'Valor, categoria e se é pago no cartão.',
      side: 'top',
    },
  ],
  investments: [
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-valor',
      title: 'O valor da reserva',
      description: 'Suas cotas, o valor total e o que está sem categoria.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-cotacao',
      title: 'Cotação',
      description: 'Vem de graça da B3. Toque em Atualizar para a mais recente.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-categorias',
      title: 'Categorias da reserva',
      description: 'Guardar numa categoria compra cotas e lança o gasto no orçamento.',
      side: 'top',
    },
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-config',
      title: 'O ativo da reserva',
      description: 'Na engrenagem você troca o código do ativo (AUPO11 por padrão).',
      side: 'bottom',
    },
  ],
  cash: [
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-reserva',
      title: 'Sua reserva',
      description: 'O dinheiro em conta mais a reserva investida sem categoria.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-dividas',
      title: 'Dívidas',
      description: 'A fatura do mês aberto e o que falta dos parcelados.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-gap',
      title: 'Falta para a reserva',
      description: 'Quanto falta (ou sobra) para a reserva que você definiu.',
      side: 'top',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-config',
      title: 'Sua reserva de emergência',
      description: 'Na engrenagem: quanto tem em conta e quantos meses a reserva cobre.',
      side: 'bottom',
    },
  ],
  diagram: [
    {
      route: () => '/diagrama',
      anchor: 'diagrama-carteira',
      title: 'Sua carteira por tipo',
      description: 'Quanto cada tipo pesa hoje e a meta dele.',
      side: 'bottom',
    },
    {
      route: () => '/diagrama',
      anchor: 'diagrama-valor',
      title: 'Quanto você quer investir?',
      description: 'Digite e toque em Calcular: vai primeiro para quem está mais longe da meta.',
      side: 'bottom',
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
  investments: { route: () => '/carteira/reserva' },
  cash: { route: () => '/carteira/caixa' },
  diagram: { route: () => '/diagrama' },
  reminders: { route: () => '/lembretes' },
  voice: { route: home, sheet: 'voice' },
  gmail: { route: () => '/gmail' },
};

export const helpAnchor = (key: ModuleKey) => `ajuda-${key}`;

export interface TourStep extends Omit<TourStepDefinition, 'route'> {
  href: string;
  module: ModuleKey;
}

/**
 * The steps of these modules' tours, one after the other, with the routes for `month`. Each
 * module's part ends on its help button.
 */
export function tourSteps(keys: ModuleKey[], month: Month): TourStep[] {
  return keys.flatMap((key) => [
    ...MODULE_TOURS[key].map(({ route, ...step }) => ({ ...step, href: route(month), module: key })),
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
