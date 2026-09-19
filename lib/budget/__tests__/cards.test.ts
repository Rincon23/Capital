import { describe, expect, it } from 'vitest';
import {
  billDueDate,
  billNoticeDays,
  cardBills,
  DEFAULT_CARD_SETTINGS,
  dueLabel,
  lateBills,
  nextBankingDay,
  nextBillToPay,
  nominalDueDate,
  noCardClearDate,
  openCardDebt,
} from '../cards';
import type { CardBillPayment, CreditCard } from '../types';

function card(overrides: Partial<CreditCard> = {}): CreditCard {
  return {
    id: 'nubank',
    name: 'Nubank',
    dueDay: 10,
    dueMonth: 'next',
    notifyEnabled: true,
    notifyBeforeDays: 1,
    isDefault: true,
    order: 0,
    ...overrides,
  };
}

describe('vencimento da fatura', () => {
  it('vence no mês seguinte à competência, por padrão', () => {
    expect(nominalDueDate(card(), '2026-09')).toBe('2026-10-10');
    // 10/10/2026 cai num sábado, então a fatura é paga na segunda.
    expect(billDueDate(card(), '2026-09')).toBe('2026-10-12');
    expect(billDueDate(card(), '2026-10')).toBe('2026-11-10');
  });

  it('pode vencer no mesmo mês da competência', () => {
    expect(nominalDueDate(card({ dueMonth: 'same' }), '2026-09')).toBe('2026-09-10');
  });

  it('usa o último dia quando o mês não tem o dia escolhido', () => {
    expect(nominalDueDate(card({ dueDay: 31 }), '2026-01')).toBe('2026-02-28');
  });

  it('vencimento no sábado vai para a segunda', () => {
    // 2026-08-01 é um sábado.
    expect(nextBankingDay('2026-08-01')).toBe('2026-08-03');
    expect(billDueDate(card({ dueDay: 1 }), '2026-07')).toBe('2026-08-03');
  });

  it('vencimento no domingo vai para a segunda', () => {
    // 2026-08-02 é um domingo.
    expect(nextBankingDay('2026-08-02')).toBe('2026-08-03');
  });

  it('não mexe num dia útil', () => {
    expect(nextBankingDay('2026-08-03')).toBe('2026-08-03');
    expect(nextBankingDay('2026-08-07')).toBe('2026-08-07');
  });

  it('o adiamento pode atravessar o mês sem mudar a competência da fatura', () => {
    // 2026-05-31 é um domingo: a fatura de abril passa a ser paga em 01/06.
    const bills = cardBills(
      [card({ dueDay: 31 })],
      [{ month: '2026-04', cardId: 'nubank', total: 500 }],
      [],
      '2026-05-20',
    );
    expect(bills[0].month).toBe('2026-04');
    expect(bills[0].postponedFrom).toBe('2026-05-31');
    expect(bills[0].dueDate).toBe('2026-06-01');
  });
});

describe('fatura sem cartão cadastrado', () => {
  it('sai sozinha no dia 1º do mês seguinte', () => {
    expect(noCardClearDate('2026-09')).toBe('2026-10-01');
    const open = cardBills([], [{ month: '2026-09', cardId: null, total: 300 }], [], '2026-09-30');
    expect(open).toHaveLength(1);
    expect(open[0].cardId).toBeNull();
    expect(open[0].clearsOn).toBe('2026-10-01');
    expect(openCardDebt(open)).toBe(-300);

    const cleared = cardBills([], [{ month: '2026-09', cardId: null, total: 300 }], [], '2026-10-01');
    expect(cleared).toEqual([]);
    expect(openCardDebt(cleared)).toBe(-0);
  });

  it('as compras de um cartão que não existe mais entram nela', () => {
    const bills = cardBills(
      [],
      [
        { month: '2026-09', cardId: null, total: 100 },
        { month: '2026-09', cardId: 'apagado', total: 50 },
      ],
      [],
      '2026-09-15',
    );
    expect(bills).toHaveLength(1);
    expect(bills[0].total).toBe(150);
  });
});

describe('fatura de cartão cadastrado', () => {
  const totals = [{ month: '2026-09', cardId: 'nubank', total: 1200 }];

  it('continua em aberto depois do vencimento, até marcar como paga', () => {
    const bills = cardBills([card()], totals, [], '2026-10-15');
    expect(bills[0].paid).toBe(false);
    expect(bills[0].daysUntilDue).toBeLessThan(0);
    expect(lateBills(bills)).toHaveLength(1);
    expect(openCardDebt(bills)).toBe(-1200);
    expect(dueLabel(bills[0])).toBe('atrasada há 3 dias');
  });

  it('sai da dívida quando é marcada como paga', () => {
    const payments: CardBillPayment[] = [
      { cardId: 'nubank', month: '2026-09', amount: 1200, paidAt: '2026-10-09T12:00:00Z' },
    ];
    const bills = cardBills([card()], totals, payments, '2026-10-15');
    expect(bills[0].paid).toBe(true);
    expect(openCardDebt(bills)).toBe(-0);
    expect(nextBillToPay(bills)).toBeNull();
  });

  it('soma as competências que ficaram em aberto ao mesmo tempo', () => {
    const bills = cardBills(
      [card()],
      [
        { month: '2026-08', cardId: 'nubank', total: 800 },
        { month: '2026-09', cardId: 'nubank', total: 1200 },
      ],
      [],
      '2026-10-05',
    );
    expect(bills.map((bill) => bill.month)).toEqual(['2026-08', '2026-09']);
    expect(openCardDebt(bills)).toBe(-2000);
    expect(nextBillToPay(bills)?.month).toBe('2026-08');
  });

  it('não mostra fatura zerada', () => {
    expect(cardBills([card()], [{ month: '2026-09', cardId: 'nubank', total: 0 }], [], '2026-09-10')).toEqual([]);
  });
});

describe('dias de aviso', () => {
  it('conta o aviso antecipado a partir do vencimento já adiado', () => {
    // 2026-08-01 (sábado) vira 2026-08-03; "1 dia antes" é o domingo 02.
    const days = billNoticeDays(card({ dueDay: 1, notifyBeforeDays: 1 }), '2026-07', DEFAULT_CARD_SETTINGS);
    expect(days.due).toBe('2026-08-03');
    expect(days.advance).toBe('2026-08-02');
    expect(days.late[0]).toBe('2026-08-04');
    expect(days.late).toHaveLength(7);
  });

  it('sem aviso antecipado quando a pessoa escolheu só no dia', () => {
    expect(billNoticeDays(card({ notifyBeforeDays: 0 }), '2026-09', DEFAULT_CARD_SETTINGS).advance).toBeNull();
  });

  it('não insiste quando a pessoa desligou a insistência', () => {
    const days = billNoticeDays(card(), '2026-09', { ...DEFAULT_CARD_SETTINGS, repeatUntilPaid: false });
    expect(days.late).toEqual([]);
  });
});
