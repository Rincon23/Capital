import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, type Expense, type TopicConfig } from '@/lib/budget';
import { ExpenseFormSheet } from '../ExpenseFormSheet';

const TOPICS: TopicConfig[] = [
  { id: 'diversos', name: 'Diversos', targetPct: 0.5, order: 0 },
  { id: 'metas', name: 'Metas', targetPct: 0.5, order: 1 },
];

function renderSheet(props: Partial<ComponentProps<typeof ExpenseFormSheet>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <ExpenseFormSheet
      month="2026-09"
      topics={TOPICS}
      specialCategories={DEFAULT_SPECIAL_CATEGORY_LABELS}
      onClose={vi.fn()}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

describe('ExpenseFormSheet e a categoria "A receber"', () => {
  it('não mostra a categoria enquanto o módulo está desligado', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: 'A receber' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custo Fixo' })).toBeInTheDocument();
  });

  it('mostra a categoria, a explicação e força o cartão quando o módulo está ligado', async () => {
    const { onSave } = renderSheet({ reimbursableEnabled: true });

    fireEvent.click(screen.getByRole('button', { name: 'A receber' }));
    expect(screen.getByText(/alguém vai te devolver/i)).toBeInTheDocument();

    const card = screen.getByRole('checkbox');
    expect(card).toBeChecked();
    expect(card).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/valor em reais/i), { target: { value: '73,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as Expense;
    expect(saved.categoryKind).toBe('reimbursable');
    expect(saved.singleInstallmentCard).toBe(true);
    expect(saved.topicId).toBeUndefined();
    expect(saved.amount).toBe(73);
  });

  it('continua editável quando o módulo é desligado depois do lançamento', () => {
    const existing: Expense = {
      id: 'r1',
      categoryKind: 'reimbursable',
      description: 'Compra para outra pessoa',
      amount: 73,
      date: '2026-09-05',
      singleInstallmentCard: true,
    };
    renderSheet({ initial: existing, reimbursableEnabled: false });
    expect(screen.getByRole('button', { name: 'A receber' })).toBeInTheDocument();
  });

  it('usa o rótulo que o usuário escolheu para a categoria', () => {
    renderSheet({
      reimbursableEnabled: true,
      specialCategories: { ...DEFAULT_SPECIAL_CATEGORY_LABELS, reimbursable: 'Me devem' },
    });
    expect(screen.getByRole('button', { name: 'Me devem' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A receber' })).not.toBeInTheDocument();
  });
});
