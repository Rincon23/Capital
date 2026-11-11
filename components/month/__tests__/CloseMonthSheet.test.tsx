import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { computeMonthSummary, type MonthData, type TopicConfig } from '@/lib/budget';
import { CloseMonthSheet, closedMonthMessage } from '../CloseMonthSheet';

const TOPICS: TopicConfig[] = [
  { id: 'diversos', name: 'Diversos', targetPct: 0.5, order: 0 },
  { id: 'metas', name: 'Metas', targetPct: 0.5, order: 1 },
];

/** September with 1.000 of income, 600 spent in Diversos: one topic ends negative. */
function september(): MonthData {
  return {
    month: '2026-09',
    incomes: [{ id: 'i1', source: 'Salário', amount: 1000 }],
    expenses: [
      {
        id: 'e1',
        categoryKind: 'topic',
        topicId: 'diversos',
        description: 'Mercado',
        amount: 600,
        date: '2026-09-04',
      },
    ],
    carryIn: { diversos: 0, metas: 0 },
    topicsSnapshot: TOPICS,
  };
}

function renderSheet(month: MonthData, onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <CloseMonthSheet
      summary={computeMonthSummary(month)}
      target="2026-10"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
}

describe('CloseMonthSheet', () => {
  it('mostra a sobra de cada categoria e para onde elas vão, sem total somado', () => {
    renderSheet(september());

    expect(screen.getByText('Diversos')).toBeInTheDocument();
    expect(screen.getByText('-R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Fechar setembro' })).toBeInTheDocument();
    expect(screen.getByText('Sobra de cada categoria')).toBeInTheDocument();
    expect(screen.getByText('Levar a sobra para outubro?')).toBeInTheDocument();
    // No total of them all (-100 + 500): the owner asked every summed total out.
    expect(screen.queryByText('R$ 400,00')).not.toBeInTheDocument();
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
  });

  it('avisa que as sobras negativas também são carregadas', () => {
    renderSheet(september());
    expect(screen.getByText(/começa outubro devendo/i)).toBeInTheDocument();
  });

  it('não avisa nada quando todas as sobras são positivas', () => {
    const month = september();
    month.expenses = [];
    renderSheet(month);
    expect(screen.queryByText(/devendo/i)).not.toBeInTheDocument();
  });

  it('só fecha o mês com a resposta da pessoa, e cada botão dá a sua', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    renderSheet(september(), onConfirm, onCancel);

    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[1]);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Não levar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith(false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Levar a sobra' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Levar a sobra' }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith(true));
  });

  it('não pergunta nada quando nenhuma categoria tem sobra', async () => {
    const month = september();
    month.incomes = [];
    month.expenses = [];
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderSheet(month, onConfirm);

    expect(screen.queryByText(/Levar a sobra/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar mês' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(true));
  });

  it('fechando vários, diz quantos são, de quando a quando e pergunta sobre o total', () => {
    render(
      <CloseMonthSheet
        summary={computeMonthSummary(september())}
        target="2026-10"
        months={['2026-08', '2026-09']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Fechar 2 meses' })).toBeInTheDocument();
    expect(screen.getByText(/De agosto a setembro/)).toBeInTheDocument();
    expect(screen.getByText('Levar a sobra para outubro?')).toBeInTheDocument();
    expect(closedMonthMessage(computeMonthSummary(september()), '2026-10', false, ['2026-08', '2026-09'])).toBe(
      '2 meses fechados. A sobra não foi para outubro.',
    );
  });

  it('diz o que aconteceu com a sobra', () => {
    const summary = computeMonthSummary(september());
    expect(closedMonthMessage(summary, '2026-10', true)).toBe('Setembro fechado. A sobra foi para outubro.');
    expect(closedMonthMessage(summary, '2026-10', false)).toBe('Setembro fechado. A sobra não foi para outubro.');

    const empty = september();
    empty.incomes = [];
    empty.expenses = [];
    expect(closedMonthMessage(computeMonthSummary(empty), '2026-10', true)).toBe('Setembro fechado.');
  });
});
