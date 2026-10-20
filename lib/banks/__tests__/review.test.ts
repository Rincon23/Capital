import { describe, expect, it } from 'vitest';
import type { CategoryOption } from '@/lib/ai';
import type { Expense, InstallmentPlan } from '@/lib/budget';
import {
  descriptionKey,
  findDuplicate,
  findDuplicateIncome,
  groupInstallments,
  ignoreReason,
  matchingPlan,
  memoryKey,
  reviewKind,
  suggestCategory,
  type ReviewTransaction,
} from '..';

let next = 0;
const tx = (overrides: Partial<ReviewTransaction>): ReviewTransaction => ({
  id: `t${(next += 1)}`,
  accountId: 'conta',
  accountKind: 'checking',
  date: '2026-10-18',
  amount: -10,
  type: 'DEBIT',
  description: 'ALGO',
  category: null,
  operationType: null,
  paymentMethod: null,
  payerName: null,
  receiverName: null,
  merchantName: null,
  installmentNumber: null,
  totalInstallments: null,
  purchaseDate: null,
  ...overrides,
});
const card = (overrides: Partial<ReviewTransaction>) =>
  tx({ accountId: 'cartao', accountKind: 'card', amount: 45.9, type: 'DEBIT', ...overrides });

describe('what each transaction suggests', () => {
  it('leaves out bill payments, own transfers, investments and card credits, saying why', () => {
    expect(ignoreReason(tx({ category: 'Credit card payment' }))).toBe('bill_payment');
    expect(ignoreReason(card({ amount: -1200, type: 'CREDIT', operationType: 'PAGAMENTO_FATURA' }))).toBe(
      'bill_payment',
    );
    expect(ignoreReason(tx({ category: 'Same person transfer' }))).toBe('own_transfer');
    expect(ignoreReason(tx({ operationType: 'TRANSFERENCIA_MESMA_INSTITUICAO' }))).toBe('own_transfer');
    expect(ignoreReason(tx({ operationType: 'RESGATE_APLIC_FINANCEIRA', type: 'CREDIT' }))).toBe('investment');
    expect(ignoreReason(tx({ category: 'Proceeds interests and dividends' }))).toBe('investment');
    expect(ignoreReason(card({ amount: -30, type: 'CREDIT', operationType: 'ESTORNO' }))).toBe('card_credit');
    expect(ignoreReason(card({}))).toBeNull();
    expect(ignoreReason(tx({ paymentMethod: 'PIX' }))).toBeNull();
  });

  it('a card purchase is an expense, split in instalments a plan; money in is an income', () => {
    expect(reviewKind(card({}))).toBe('expense');
    expect(reviewKind(card({ totalInstallments: 10, installmentNumber: 1 }))).toBe('plan');
    expect(reviewKind(tx({ type: 'CREDIT', amount: 50 }))).toBe('income');
    expect(reviewKind(tx({ type: 'DEBIT', amount: -50 }))).toBe('expense');
  });
});

describe('split purchases', () => {
  it('reads the same with or without the instalment number in the description', () => {
    expect(descriptionKey('LOJA X PARC 06/10')).toBe(descriptionKey('Loja X 07/10'));
    expect(descriptionKey('LOJA X 6 de 10')).toBe('loja x');
  });

  it('one line per purchase when the bank sends every instalment at once', () => {
    const instalments = Array.from({ length: 10 }, (_, index) =>
      card({
        description: `LOJA ${String(index + 1).padStart(2, '0')}/10`,
        amount: index === 0 ? 87.29 : 87.23,
        date: index === 0 ? '2026-02-09' : '2026-02-10',
        purchaseDate: '2026-02-09',
        installmentNumber: index + 1,
        totalInstallments: 10,
      }),
    );
    const [group] = groupInstallments(instalments);
    expect(group).toMatchObject({
      count: 10,
      installmentAmount: 87.23,
      total: 872.36,
      purchaseDate: '2026-02-09',
    });
    expect(group.transactions).toHaveLength(10);
  });

  it('and when it sends one a month, the total comes from the instalment', () => {
    const groups = groupInstallments([
      card({ description: 'CURSO 04/10', amount: 79.93, installmentNumber: 4, totalInstallments: 10, purchaseDate: '2025-09-08' }),
      card({ description: 'OUTRA 02/03', amount: 20, installmentNumber: 2, totalInstallments: 3, purchaseDate: '2026-09-01' }),
    ]);
    expect(groups.map((group) => [group.count, group.total, group.numbers])).toEqual([
      [10, 799.3, [4]],
      [3, 60, [2]],
    ]);
  });

  it('knows the purchase already registered, by card, count, instalment and day', () => {
    const plan: InstallmentPlan = {
      id: 'plano',
      name: 'Curso',
      categoryKind: 'topic',
      topicId: 'educacao',
      firstDebitDate: '2025-10-09',
      purchaseDate: '2025-09-07',
      count: 10,
      totalAmount: 799.3,
      accounting: 'installment',
      cardId: 'nubank',
    };
    const [group] = groupInstallments([
      card({ description: 'CURSO 04/10', amount: 79.93, installmentNumber: 4, totalInstallments: 10, purchaseDate: '2025-09-08' }),
    ]);
    expect(matchingPlan(group, [plan], 'nubank')).toBe(plan);
    expect(matchingPlan(group, [plan], 'outro-cartao')).toBeNull();
    expect(matchingPlan(group, [{ ...plan, count: 12 }], 'nubank')).toBeNull();
    expect(matchingPlan(group, [{ ...plan, purchaseDate: '2025-08-01' }], 'nubank')).toBeNull();
  });
});

describe('the category it suggests', () => {
  const options: CategoryOption[] = [
    { categoryKind: 'topic', topicId: 'mercado', label: 'Mercado' },
    { categoryKind: 'topic', topicId: 'diversos', label: 'Diversos' },
    { categoryKind: 'topic', topicId: 'faculdade', label: 'Faculdade' },
    { categoryKind: 'fixedCost', label: 'Custo Fixo' },
    { categoryKind: 'unforeseen', label: 'Imprevistos' },
  ];

  it('first what the person chose before for the same description', () => {
    const memory = new Map([[memoryKey('PADARIA DO ZE'), { categoryKind: 'topic' as const, topicId: 'diversos' }]]);
    expect(suggestCategory({ description: 'Padaria do Zé', merchantName: null, category: 'Groceries' }, options, memory))
      .toMatchObject({ topicId: 'diversos' });
  });

  it("then Pluggy's category, only when the person has a category called like it", () => {
    const none = new Map();
    expect(suggestCategory({ description: 'ASSAI ATACADISTA', merchantName: null, category: 'Groceries' }, options, none))
      .toMatchObject({ topicId: 'mercado' });
    expect(suggestCategory({ description: 'CURSO X', merchantName: null, category: 'School' }, options, none))
      .toMatchObject({ topicId: 'faculdade' });
    expect(suggestCategory({ description: 'TARIFA', merchantName: null, category: 'Bank fees' }, options, none))
      .toMatchObject({ categoryKind: 'unforeseen' });
    expect(suggestCategory({ description: 'UBER *TRIP', merchantName: null, category: 'Taxi and ride-hailing' }, options, none))
      .toBeNull();
  });

  it('then the default category the person kept, by what it means', () => {
    const defaults: CategoryOption[] = [
      { categoryKind: 'topic', topicId: 't-div', label: 'Diversos' },
      { categoryKind: 'topic', topicId: 't-con', label: 'Conhecimentos' },
      { categoryKind: 'fixedCost', label: 'Custo Fixo' },
    ];
    const presets = { diversos: 't-div', conhecimentos: 't-con' };
    const none = new Map();
    const suggest = (category: string) =>
      suggestCategory({ description: 'X', merchantName: null, category }, defaults, none, presets);
    expect(suggest('Eating out')).toMatchObject({ topicId: 't-div' });
    expect(suggest('University')).toMatchObject({ topicId: 't-con' });
    expect(suggest('Video streaming')).toMatchObject({ categoryKind: 'fixedCost' });
    // Metas was renamed into something else (no preset kept): no guess for a trip.
    expect(suggest('Travel')).toBeNull();
    // The supermarket is not obvious in this model: the person chooses.
    expect(suggest('Groceries')).toBeNull();
  });

  it('a remembered category that no longer exists is not suggested', () => {
    const memory = new Map([[memoryKey('PADARIA'), { categoryKind: 'topic' as const, topicId: 'arquivada' }]]);
    expect(suggestCategory({ description: 'PADARIA', merchantName: null, category: null }, options, memory)).toBeNull();
  });
});

describe('"Parece que você já lançou isso"', () => {
  const expense = (overrides: Partial<Expense>): Expense => ({
    id: 'e1',
    categoryKind: 'topic',
    topicId: 'mercado',
    description: 'Mercado',
    amount: 87.96,
    date: '2026-10-18',
    ...overrides,
  });

  it('same amount within 2 days, on the same card when both say one, not taken already', () => {
    const launched = [{ month: '2026-10', expense: expense({}) }];
    const item = { amount: 87.96, date: '2026-10-20', onCard: false, cardId: null };
    expect(findDuplicate(item, launched, new Set())?.expense.id).toBe('e1');
    expect(findDuplicate({ ...item, date: '2026-10-21' }, launched, new Set())).toBeNull();
    expect(findDuplicate({ ...item, amount: 87.95 }, launched, new Set())).toBeNull();
    expect(findDuplicate(item, launched, new Set(['e1']))).toBeNull();
    const onCard = [{ month: '2026-10', expense: expense({ cardId: 'btg', singleInstallmentCard: true }) }];
    expect(findDuplicate({ ...item, onCard: true, cardId: 'nubank' }, onCard, new Set())).toBeNull();
    expect(findDuplicate({ ...item, onCard: true, cardId: 'btg' }, onCard, new Set())?.expense.id).toBe('e1');
    expect(findDuplicate(item, [{ month: '2026-10', expense: expense({ installmentId: 'p' }) }], new Set())).toBeNull();
  });

  it('and for money in', () => {
    const incomes = [{ month: '2026-10', income: { id: 'i1', source: 'Salário', amount: 5000, date: '2026-10-05' } }];
    expect(findDuplicateIncome({ amount: 5000, date: '2026-10-06' }, incomes, new Set())?.income.id).toBe('i1');
    expect(findDuplicateIncome({ amount: 5000, date: '2026-10-09' }, incomes, new Set())).toBeNull();
  });
});
