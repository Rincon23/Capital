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
 * The tour of every module (a `Record`, so a module without a tour does not compile). Steps point
 * at the module's own screen, never at the bottom bar, which changes with each person's choices.
 */
export const MODULE_TOURS: Record<ModuleKey, TourStepDefinition[]> = {
  expenses: [
    {
      route: entries,
      anchor: 'lancamentos-abas',
      title: 'Tudo o que entrou e saiu',
      description:
        'Gastos, renda, custos fixos e imprevistos do mês ficam em abas. Toque num lançamento para editar ou excluir.',
      side: 'bottom',
    },
    {
      route: entries,
      anchor: 'lancamentos-busca',
      title: 'Busca',
      description: 'Procure pelo que você escreveu na descrição do gasto ou na fonte da renda.',
      side: 'bottom',
    },
    {
      route: entries,
      anchor: 'lancamentos-mes',
      title: 'Cada mês separado',
      description: 'Use as setas para ver os lançamentos de outro mês.',
      side: 'bottom',
    },
    {
      route: entries,
      anchor: 'fab-lancar-gasto',
      title: 'Lançar gasto',
      description: 'Toque aqui sempre que gastar: valor, categoria, descrição e data.',
      side: 'top',
    },
    {
      route: entries,
      anchor: 'fab-renda',
      title: 'Registrar renda',
      description: 'Salário, freela ou qualquer dinheiro que entrou no mês.',
      side: 'top',
    },
    {
      route: entries,
      anchor: 'lancamentos-config',
      title: 'Suas categorias',
      description:
        'Na engrenagem você muda o nome, a descrição e a cor das categorias em que os gastos são lançados.',
      side: 'bottom',
    },
  ],
  budget: [
    {
      route: categories,
      anchor: 'posso-gastar',
      title: 'Quanto dá para gastar',
      description:
        'O que as categorias recebem da renda neste mês, já sem os custos fixos e os imprevistos. O Saldo geral, ao lado, é o que ainda sobra depois dos gastos.',
      side: 'bottom',
    },
    {
      route: categories,
      anchor: 'categorias',
      title: 'Suas categorias',
      description:
        'Cada categoria recebe uma % da renda e diz para que serve. A barra mostra quanto já foi usado; toque numa categoria para ver a conta e os gastos dela.',
      side: 'top',
    },
    {
      route: categories,
      anchor: 'categorias-porcentagens',
      title: 'Na dúvida sobre as %?',
      description:
        'Aqui eu te ajudo a decidir quanto da renda vai para cada categoria: você conta quanto ganha e seus custos, e vê na hora quanto cada % deixa para gastar.',
      side: 'bottom',
    },
    {
      route: categories,
      anchor: 'custos-fixos',
      title: 'Custos fixos e imprevistos',
      description:
        'Eles não têm meta própria: o total é dividido entre as categorias, na proporção da % de cada uma. Um gasto que se repete todo mês e é maior que a categoria entra aqui, como custo fixo.',
      side: 'top',
    },
    {
      route: categories,
      anchor: 'fechar-mes',
      title: 'Fechar o mês',
      description:
        'No fim do mês, feche para levar a sobra (ou o que passou da meta) de cada categoria para o mês seguinte.',
      side: 'top',
    },
    {
      route: categories,
      anchor: 'categorias-config',
      title: 'Ajustar as categorias',
      description:
        'Na engrenagem você ajusta nome, descrição, cor e a % de cada categoria (juntas, fecham 100% da renda), e pode voltar às categorias padrão quando quiser.',
      side: 'bottom',
    },
  ],
  card: [
    {
      route: card,
      anchor: 'cartao-fatura',
      title: 'A fatura do mês',
      description:
        'Quanto vem nesta competência e o dia em que ela vence. Use as setas para ver as faturas anteriores; vencimento em sábado ou domingo passa para a segunda, como no banco.',
      side: 'bottom',
    },
    {
      route: card,
      anchor: 'cartao-lancamentos',
      title: 'O que entrou nela',
      description:
        'As compras à vista e as parcelas que caem neste mês, por data. Toque em uma para editar — numa parcela, você escolhe se muda a compra toda ou só aquele mês.',
      side: 'top',
    },
    {
      route: card,
      anchor: 'cartao-pagar',
      title: 'Fatura paga',
      description:
        'Nenhuma fatura sai sozinha: ela continua na dívida da Reserva de emergência até você tocar aqui — inclusive a de "Não informado", que junta as compras sem cartão escolhido.',
      side: 'bottom',
    },
    {
      route: () => `${card()}?aba=parcelados`,
      anchor: 'cartao-aba-parcelados',
      title: 'O que já está comprometido',
      description:
        'Aqui ficam as compras parceladas: quanto falta, quantas parcelas restam e quanto cada um dos próximos meses já tem reservado. Pagou parcelas antes da hora? Use "Adiantar parcelas" — o app pergunta se teve desconto e encurta a compra.',
      side: 'bottom',
    },
    {
      route: () => `${card()}?aba=parcelados`,
      anchor: 'cartao-parcelado-novo',
      title: 'Uma compra que já vinha pagando',
      description:
        'Aqui você cadastra um parcelamento de antes do Capital: diga quantas parcelas já foram pagas e os meses que já passaram ficam como estão — só o que falta entra na fatura e na dívida.',
      side: 'bottom',
    },
    {
      route: () => `${card()}?aba=cartoes`,
      anchor: 'cartao-aba-cartoes',
      title: 'Seus cartões',
      description:
        'Cadastre o nome, o dia do vencimento, com quanta antecedência quer ser avisado e, se quiser acompanhar, o limite.',
      side: 'bottom',
    },
    {
      route: card,
      anchor: 'cartao-config',
      title: 'Avisos no celular',
      description:
        'Na engrenagem você escolhe o horário do aviso, se ele deve insistir até a fatura ser paga e ativa as notificações neste aparelho.',
      side: 'bottom',
    },
    {
      route: home,
      anchor: 'cartao-pergunta',
      title: 'Foi no cartão?',
      description:
        'Ao lançar um gasto, marque aqui quando pagar no crédito: você escolhe o cartão (ou "Não informar") e, se quiser, parcela a compra.',
      side: 'top',
      sheet: 'expense-form',
    },
  ],
  reimbursable: [
    {
      route: home,
      anchor: 'categoria-a-receber',
      title: 'Uma compra para outra pessoa',
      description:
        'No formulário de gasto, escolha esta opção quando pagar no seu cartão algo que alguém vai te devolver. Não gasta nenhuma categoria.',
      side: 'top',
      sheet: 'expense-form-reimbursable',
    },
    {
      route: (month) => `${entries(month)}?aba=a-receber`,
      anchor: 'aba-a-receber',
      title: 'A aba A receber',
      description: 'Em Lançamentos ficam todas essas compras do mês, para você saber quem ainda precisa te pagar.',
      side: 'bottom',
    },
    {
      route: home,
      anchor: 'card-reimbursable',
      title: 'Quanto volta para você',
      description: 'O total a receber no mês. Ele entra na fatura do cartão, mas não é dinheiro que você gastou.',
      side: 'bottom',
    },
  ],
  history: [
    {
      route: () => '/historico',
      anchor: 'historico-aderencia',
      title: 'Aderência à meta',
      description: 'Quanto você gastou de cada categoria em comparação com a meta, no mês mais recente.',
      side: 'bottom',
    },
    {
      route: () => '/historico',
      anchor: 'historico-graficos',
      title: 'Gráficos',
      description:
        'A evolução do gasto por categoria, a composição de cada mês e a sobra que passou de um mês para o outro.',
      side: 'top',
    },
    {
      route: () => '/historico',
      anchor: 'historico-tabela',
      title: 'Mês a mês',
      description: 'A tabela com os números de cada categoria. Use as setas para trocar de mês.',
      side: 'top',
    },
  ],
  recurring: [
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-lista',
      title: 'Seus gastos de todo mês',
      description:
        'Aluguel, internet, assinaturas: cada um vira um modelo. O botão Lançar abre o gasto já preenchido, com a data de hoje.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/recorrentes',
      anchor: 'recorrentes-novo',
      title: 'Novo modelo',
      description: 'Crie um modelo com valor, categoria e se é pago no cartão.',
      side: 'bottom',
    },
  ],
  investments: [
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-valor',
      title: 'O valor da reserva',
      description: 'Suas cotas, o valor total e a reserva livre (a parte que não está em nenhuma categoria da reserva).',
      side: 'bottom',
    },
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-cotacao',
      title: 'Cotação',
      description: 'A cotação vem de graça da B3 e se atualiza sozinha. Toque em Atualizar para buscar a mais recente.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-categorias',
      title: 'Categorias da reserva',
      description:
        'Separe parte das cotas para uma categoria do orçamento. Remanejar compra cotas para ela e lança o gasto nessa categoria.',
      side: 'top',
    },
    {
      route: () => '/carteira/reserva',
      anchor: 'reserva-config',
      title: 'O ativo da reserva',
      description: 'Na engrenagem você troca o código do ativo na bolsa (AUPO11 por padrão).',
      side: 'bottom',
    },
  ],
  cash: [
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-reserva',
      title: 'Sua reserva',
      description: 'O dinheiro em conta mais a reserva investida livre.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-dividas',
      title: 'Dívidas',
      description: 'A fatura do cartão do mês aberto e o que ainda falta pagar dos parcelados.',
      side: 'bottom',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-gap',
      title: 'Gap da reserva',
      description: 'Quanto falta (ou quanto sobra) para a reserva de emergência que você definiu.',
      side: 'top',
    },
    {
      route: () => '/carteira/caixa',
      anchor: 'caixa-config',
      title: 'Sua reserva de emergência',
      description:
        'Na engrenagem você informa quanto tem em conta, quanto gastaria por mês sem renda e quantos meses a reserva deve cobrir.',
      side: 'bottom',
    },
  ],
  reminders: [
    {
      route: () => '/lembretes',
      anchor: 'lembretes-abas',
      title: 'Hoje, Todos e Calendário',
      description:
        'Hoje mostra o que está atrasado, o que vence hoje e as tarefas do dia. Toque no círculo para marcar como feito.',
      side: 'bottom',
    },
    {
      route: () => '/lembretes',
      anchor: 'lembretes-novo',
      title: 'Novo lembrete',
      description: 'Uma vez, tarefa do dia, toda semana ou todo mês, com o horário do aviso que você escolher.',
      side: 'bottom',
    },
    {
      route: () => '/lembretes',
      anchor: 'lembretes-config',
      title: 'Avisos no celular',
      description:
        'Na engrenagem você ativa as notificações neste aparelho e escolhe os horários para lembrar de novo o que ficou para trás.',
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
      description: 'Diga a categoria, o valor e o que foi. Se não foi hoje ou foi no cartão, diga também.',
      side: 'bottom',
      sheet: 'voice',
    },
    {
      route: home,
      anchor: 'voz-escrever',
      title: 'Ou escreva',
      description:
        'A IA monta o gasto e mostra para você conferir. O lápis abre o formulário para corrigir; nada é salvo sem você confirmar.',
      side: 'top',
      sheet: 'voice',
    },
  ],
  gmail: [
    {
      route: () => '/gmail',
      anchor: 'gmail-conta',
      title: 'Sua conta',
      description:
        'Conecte o seu Gmail com permissão só de leitura. Depois dá para verificar agora ou desconectar por aqui.',
      side: 'bottom',
    },
    {
      route: () => '/gmail',
      anchor: 'gmail-palavras',
      title: 'Palavras-chave',
      description:
        'Quando chegar um e-mail com uma delas no assunto, no remetente ou na prévia, o celular avisa.',
      side: 'top',
    },
    {
      route: () => '/gmail',
      anchor: 'gmail-alertas',
      title: 'Alertas',
      description: 'Os e-mails encontrados ficam aqui. Toque em um para abrir no Gmail.',
      side: 'top',
    },
    {
      route: () => '/gmail',
      anchor: 'gmail-config',
      title: 'Avisos no celular',
      description: 'Na engrenagem você ativa as notificações neste aparelho, para os alertas chegarem na hora.',
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
