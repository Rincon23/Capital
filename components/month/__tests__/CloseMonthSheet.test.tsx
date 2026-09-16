import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { computeMonthSummary, type MonthData, type TopicConfig } from '@/lib/budget';
import { CloseMonthSheet } from '../CloseMonthSheet';

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

describe('CloseMonthSheet', () => {
  it('mostra a sobra de cada categoria, o total e para onde elas vão', () => {
    render(
      <CloseMonthSheet summary={computeMonthSummary(september())} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText('Diversos')).toBeInTheDocument();
    expect(screen.getByText('-R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
    expect(screen.getByText(/Outubro 2026/)).toBeInTheDocument();
    // Total: -100 + 500.
    expect(screen.getByText('R$ 400,00')).toBeInTheDocument();
  });

  it('avisa que as sobras negativas também são carregadas', () => {
    render(
      <CloseMonthSheet summary={computeMonthSummary(september())} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(/começam devendo/i)).toBeInTheDocument();
  });

  it('não avisa nada quando todas as sobras são positivas', () => {
    const month = september();
    month.expenses = [];
    render(<CloseMonthSheet summary={computeMonthSummary(month)} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText(/começam devendo/i)).not.toBeInTheDocument();
  });

  it('só fecha o mês quando o usuário confirma', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
      <CloseMonthSheet summary={computeMonthSummary(september())} onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar mês' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });
});
