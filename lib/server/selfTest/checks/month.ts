import { computeMonthSummary } from '../../../budget/calculations';
import { nextMonth, previousMonth, shiftMonth } from '../../../budget/date';
import { createId } from '../../../budget/id';
import type { Expense } from '../../../budget/types';
import { expect, expectEqual, expectRefused, presetTopic, type SelfCheck } from '../check';

/**
 * Dinheiro do mês: Lançamentos, Gastos por categoria, A receber and Histórico. Each test writes
 * the way the screens do and reads it back the way the screens read it.
 */

function expense(overrides: Partial<Expense> & Pick<Expense, 'amount' | 'date'>): Expense {
  return { id: createId(), categoryKind: 'fixedCost', description: 'Autoteste', ...overrides };
}

export const expensesChecks: SelfCheck[] = [
  {
    id: 'expenses.month',
    name: 'Renda e gasto entram no mês e no resumo',
    run: ({ scratch }) =>
      scratch(async (account) => {
        const { budget, month, today } = account;
        const diversos = await presetTopic(account, 'diversos');
        await budget.saveIncome(month, { id: createId(), source: 'Salário', amount: 3000, date: today });
        const groceries = expense({
          categoryKind: 'topic',
          topicId: diversos,
          description: 'Mercado',
          amount: 120.5,
          date: today,
        });
        await budget.saveExpense(month, groceries);
        await budget.saveExpense(month, expense({ description: 'Aluguel', amount: 1000, date: today }));

        const data = await budget.getMonth(month);
        expect(data, 'O mês não foi criado ao lançar a primeira renda.');
        expectEqual(data.incomes.length, 1, 'Rendas no mês');
        expectEqual(data.expenses.length, 2, 'Gastos no mês');
        const summary = computeMonthSummary(data);
        expectEqual(summary.incomeTotal, 3000, 'Total de rendas');
        expectEqual(summary.expenseTotal, 1120.5, 'Total de gastos');

        await budget.deleteExpense(month, groceries.id);
        expectEqual((await budget.getMonth(month))?.expenses.length, 1, 'Gastos depois de excluir um');
      }),
  },
  {
    id: 'expenses.closed',
    name: 'Mês fechado não aceita lançamento',
    run: ({ scratch }) =>
      scratch(async ({ budget, month }) => {
        const past = previousMonth(month);
        await budget.ensureMonth(past);
        await budget.closeMonth(past);
        await expectRefused(
          budget.saveExpense(past, expense({ amount: 10, date: `${past}-10` })),
          'Um mês fechado aceitou um gasto novo.',
        );
        await budget.reopenMonth(past);
        await budget.saveExpense(past, expense({ amount: 10, date: `${past}-10` }));
        expectEqual((await budget.getMonth(past))?.expenses.length, 1, 'Gastos no mês reaberto');
      }),
  },
];

export const budgetChecks: SelfCheck[] = [
  {
    id: 'budget.envelopes',
    name: '"Ainda posso gastar" de cada categoria',
    run: ({ scratch }) =>
      scratch(async (account) => {
        const { budget, month, today } = account;
        const settings = await budget.getSettings();
        const active = settings.topics.filter((topic) => !topic.archived);
        expect(active.length > 0, 'A conta nova ficou sem categorias.');
        expectEqual(
          active.reduce((total, topic) => total + topic.targetPct, 0),
          1,
          'Soma das metas das categorias padrão',
        );

        const diversos = await presetTopic(account, 'diversos');
        await budget.saveIncome(month, { id: createId(), source: 'Salário', amount: 2000, date: today });
        await budget.saveExpense(month, expense({ description: 'Conta de luz', amount: 200, date: today }));
        await budget.saveExpense(
          month,
          expense({
            categoryKind: 'topic',
            topicId: diversos,
            description: 'Cinema',
            amount: 100,
            date: today,
          }),
        );

        const summary = computeMonthSummary((await budget.getMonth(month))!, settings.topics);
        // The fixed cost comes out of every category by its share; what is left is split by the targets.
        expectEqual(summary.availableTotal, 1800, 'Total disponível nas categorias');
        expectEqual(summary.balance, 1700, 'Saldo geral');
        const result = summary.topics.find((topic) => topic.topicId === diversos);
        expect(result, 'A categoria Diversos sumiu do resumo do mês.');
        expectEqual(result.spent, 100, 'Gasto em Diversos');
        expectEqual(result.remaining, result.available - 100, 'O que ainda dá para gastar em Diversos');
      }),
  },
  {
    id: 'budget.archive',
    name: 'Categoria tirada da lista fica arquivada, nunca apagada',
    run: ({ scratch }) =>
      scratch(async (account) => {
        const { budget } = account;
        const diversos = await presetTopic(account, 'diversos');
        const settings = await budget.getSettings();
        await budget.saveSettings({
          ...settings,
          topics: settings.topics.filter((topic) => topic.id !== diversos),
        });
        const kept = (await budget.getSettings()).topics.find((topic) => topic.id === diversos);
        expect(kept, 'Uma categoria foi apagada; elas só podem ser arquivadas.');
        expect(kept.archived === true, 'A categoria tirada da lista não ficou arquivada.');
      }),
  },
];

export const reimbursableChecks: SelfCheck[] = [
  {
    id: 'reimbursable.pending',
    name: '"A receber" fica fora do orçamento até ser pago',
    run: ({ scratch }) =>
      scratch(async ({ budget, month, today }) => {
        const past = previousMonth(month);
        const old = expense({
          categoryKind: 'reimbursable',
          description: 'Jantar do João',
          amount: 80,
          date: `${past}-15`,
        });
        const recent = expense({
          categoryKind: 'reimbursable',
          description: 'Ingresso da Ana',
          amount: 45,
          date: today,
        });
        await budget.saveExpense(past, old);
        await budget.saveExpense(month, recent);

        const summary = computeMonthSummary((await budget.getMonth(month))!);
        expectEqual(summary.reimbursableTotal, 45, '"A receber" do mês');
        expectEqual(summary.expenseTotal, 0, 'Gastos do mês (o "A receber" não conta)');

        // What someone still owes does not go away when the month turns.
        const pending = await budget.pendingReimbursables(month);
        expectEqual(
          pending.map((item) => item.expense.id).sort(),
          [old.id, recent.id].sort(),
          'Quem ainda deve',
        );
        await budget.setReimbursed(past, old.id, new Date().toISOString());
        expectEqual(
          (await budget.pendingReimbursables(month)).map((item) => item.expense.id),
          [recent.id],
          'Quem ainda deve depois de "Já me pagou"',
        );
        const received = await budget.receivedReimbursables(today);
        expect(
          received.some((item) => item.expense.id === old.id),
          '"Já me pagou" não aparece entre os recebidos.',
        );
      }),
  },
];

export const historyChecks: SelfCheck[] = [
  {
    id: 'history.rollover',
    name: 'Sobra de um mês passa para o seguinte',
    run: ({ scratch }) =>
      scratch(async (account) => {
        const { budget, month } = account;
        const diversos = await presetTopic(account, 'diversos');
        const first = shiftMonth(month, -2);
        const second = nextMonth(first);
        await budget.saveIncome(first, {
          id: createId(),
          source: 'Salário',
          amount: 1000,
          date: `${first}-05`,
        });
        await budget.saveExpense(
          first,
          expense({
            categoryKind: 'topic',
            topicId: diversos,
            description: 'Livro',
            amount: 50,
            date: `${first}-10`,
          }),
        );
        await budget.ensureMonth(second);

        const leftover = async () =>
          computeMonthSummary((await budget.getMonth(first))!).topics.find(
            (topic) => topic.topicId === diversos,
          )?.remaining;
        const carried = async () => (await budget.getMonth(second))?.carryIn[diversos];
        expectEqual(await carried(), await leftover(), 'Sobra de Diversos levada para o mês seguinte');

        // A change in the older month reaches the newer one.
        await budget.saveExpense(
          first,
          expense({
            categoryKind: 'topic',
            topicId: diversos,
            description: 'Café',
            amount: 30,
            date: `${first}-12`,
          }),
        );
        expectEqual(await carried(), await leftover(), 'Sobra depois de lançar no mês anterior');
        expectEqual(await budget.listMonths(), [first, second], 'Meses no histórico');
      }),
  },
];
