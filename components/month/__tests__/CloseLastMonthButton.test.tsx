import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { currentMonthKey, previousMonth, shiftMonth, type Month, type MonthData } from '@/lib/budget';
import { useMonthToClose } from '@/lib/hooks/useMonthToClose';
import { CloseLastMonthButton } from '../CloseLastMonthButton';
import { MonthContext, type MonthContextValue } from '../MonthContext';

const repository = vi.hoisted(() => ({
  listMonths: vi.fn(),
  getMonth: vi.fn(),
  closeMonth: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/storage', () => ({ budgetRepository: repository }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: toast }) }));

const TODAY = currentMonthKey();
const LAST = previousMonth(TODAY);

function stored(month: Month, closed = false): MonthData {
  return {
    month,
    incomes: [{ id: 'i1', source: 'Salário', amount: 1000 }],
    expenses: [],
    carryIn: { diversos: 0 },
    topicsSnapshot: [{ id: 'diversos', name: 'Diversos', targetPct: 1, order: 0 }],
    closed,
  };
}

const refresh = vi.fn().mockResolvedValue(undefined);

function Screen({ month }: { month: Month }) {
  const toClose = useMonthToClose(month);
  return (
    <MonthContext.Provider value={{ month, refresh } as unknown as MonthContextValue}>
      {toClose ? <CloseLastMonthButton {...toClose} /> : <p>Sem botão</p>}
    </MonthContext.Provider>
  );
}

/** Lets the reads of the hook finish: with no button, there is nothing else to wait for. */
async function settled() {
  await waitFor(() => expect(repository.listMonths).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve));
}

describe('CloseLastMonthButton', () => {
  beforeEach(() => {
    repository.listMonths.mockResolvedValue([LAST, TODAY]);
    repository.getMonth.mockImplementation(async (month: Month) => stored(month));
    repository.closeMonth.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('aparece no mês de hoje enquanto o mês anterior está aberto', async () => {
    render(<Screen month={TODAY} />);
    expect(await screen.findByRole('button', { name: /^Fechar / })).toBeInTheDocument();
    expect(repository.getMonth).toHaveBeenCalledWith(LAST);
  });

  it('some quando o mês anterior já está fechado', async () => {
    repository.getMonth.mockImplementation(async (month: Month) => stored(month, true));
    render(<Screen month={TODAY} />);
    await settled();
    expect(screen.getByText('Sem botão')).toBeInTheDocument();
  });

  it('não aparece para quem não tem mês anterior', async () => {
    repository.listMonths.mockResolvedValue([TODAY]);
    render(<Screen month={TODAY} />);
    await settled();
    expect(screen.getByText('Sem botão')).toBeInTheDocument();
    expect(repository.getMonth).not.toHaveBeenCalled();
  });

  it('não aparece vendo outro mês', async () => {
    render(<Screen month={LAST} />);
    await new Promise((resolve) => setTimeout(resolve));
    expect(screen.getByText('Sem botão')).toBeInTheDocument();
    expect(repository.listMonths).not.toHaveBeenCalled();
  });

  it('pula o mês que ninguém usou: a sobra vem do último que existe', async () => {
    const skipped = shiftMonth(TODAY, -2);
    repository.listMonths.mockResolvedValue([skipped, TODAY]);
    render(<Screen month={TODAY} />);
    await screen.findByRole('button', { name: /^Fechar / });
    expect(repository.getMonth).toHaveBeenCalledWith(skipped);
  });

  it('não trazer fecha o mês anterior sem a sobra, some e atualiza o mês na tela', async () => {
    render(<Screen month={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Fechar / }));
    fireEvent.click(screen.getByRole('button', { name: 'Não trazer' }));

    await waitFor(() => expect(repository.closeMonth).toHaveBeenCalledWith(LAST, false, true));
    expect(await screen.findByText('Sem botão')).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.mock.calls[0][0]).toMatch(/começa sem o que restou/);
  });

  it('trazer fecha o mês anterior e leva a sobra', async () => {
    render(<Screen month={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Fechar / }));
    fireEvent.click(screen.getByRole('button', { name: 'Trazer' }));

    await waitFor(() => expect(repository.closeMonth).toHaveBeenCalledWith(LAST, false, false));
    await waitFor(() => expect(toast.mock.calls[0][0]).toMatch(/O que restou foi para/));
  });

  it('se o fechamento falhar, o botão continua e avisa', async () => {
    repository.closeMonth.mockRejectedValue(new Error('sem conexão'));
    render(<Screen month={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Fechar / }));
    fireEvent.click(screen.getByRole('button', { name: 'Trazer' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Não foi possível fechar o mês. Tente de novo.', 'error'),
    );
    expect(screen.getByRole('button', { name: /^Fechar / })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
