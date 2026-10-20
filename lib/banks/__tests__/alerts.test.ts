import { describe, expect, it } from 'vitest';
import {
  arrivalKind,
  DEFAULT_BANK_ALERTS,
  salaryMatch,
  summarizeArrivals,
  type AlertTransaction,
  type SalaryRef,
} from '..';

/** The text without the non-breaking space formatBRL puts after R$. */
const plain = (text: string | null) => text?.replace(/\u00a0/g, ' ') ?? null;

let next = 0;
const tx = (overrides: Partial<AlertTransaction>): AlertTransaction => ({
  id: `t${(next += 1)}`,
  accountKind: 'checking',
  amount: 10,
  type: 'DEBIT',
  description: 'ALGO',
  paymentMethod: null,
  operationType: null,
  category: null,
  payerName: null,
  payerDocument: null,
  ...overrides,
});

const purchase = (amount: number) => tx({ accountKind: 'card', amount, operationType: 'PAGAMENTO' });
const pixIn = (amount: number, overrides: Partial<AlertTransaction> = {}) =>
  tx({ amount, type: 'CREDIT', paymentMethod: 'PIX', ...overrides });
const pixOut = (amount: number) => tx({ amount: -amount, type: 'DEBIT', paymentMethod: 'PIX' });

describe('what each transaction is', () => {
  it('tells card purchases and Pix apart from the rest', () => {
    expect(arrivalKind(purchase(45.9))).toBe('purchase');
    expect(arrivalKind(tx({ accountKind: 'card', amount: -1200, type: 'CREDIT', operationType: 'PAGAMENTO_FATURA' }))).toBe('other');
    expect(arrivalKind(tx({ accountKind: 'card', amount: -30, type: 'CREDIT', operationType: 'ESTORNO' }))).toBe('other');
    expect(arrivalKind(pixIn(50))).toBe('pixReceived');
    expect(arrivalKind(pixOut(20))).toBe('pixSent');
    // Moving money between one's own accounts is not news.
    expect(arrivalKind({ ...pixOut(500), category: 'Same person transfer' })).toBe('other');
    expect(arrivalKind(tx({ type: 'DEBIT', operationType: 'BOLETO' }))).toBe('other');
  });
});

describe('the summary of what arrived', () => {
  it('counts and adds each kind, in plain words', () => {
    const { body, salaries } = summarizeArrivals(
      [purchase(45.9), purchase(32.1), purchase(42), pixIn(50)],
      DEFAULT_BANK_ALERTS,
    );
    expect(plain(body)).toBe('Chegaram 3 compras no cartão (R$ 120,00) e 1 Pix recebido (R$ 50,00).');
    expect(salaries).toEqual([]);
    expect(body).not.toMatch(/agora|na hora|tempo real/i);
  });

  it('follows the settings: kinds turned off and the minimum amount', () => {
    const settings = { ...DEFAULT_BANK_ALERTS, purchases: false, minAmount: 30 };
    expect(plain(summarizeArrivals([purchase(100), pixOut(20), pixOut(80)], settings).body)).toBe(
      'Chegou 1 Pix enviado (R$ 80,00).',
    );
    expect(summarizeArrivals([purchase(100)], settings).body).toBeNull();
  });
});

describe('the salary', () => {
  const ref: SalaryRef = {
    transactionId: 'old',
    payerDocument: '12.345.678/0001-90',
    payerName: 'EMPRESA LTDA',
    description: 'TED RECEBIDA EMPRESA',
    amount: 5000,
  };

  it('is a credit from the same payer within 15% of the one the person pointed at', () => {
    expect(salaryMatch(pixIn(5400, { payerDocument: '12.345.678/0001-90' }), [ref])).toBe(ref);
    expect(salaryMatch(pixIn(5900, { payerDocument: '12.345.678/0001-90' }), [ref])).toBeNull();
    expect(salaryMatch(pixIn(5000, { payerDocument: '99.999.999/0001-99' }), [ref])).toBeNull();
    // Without the document, the name; without the name, the description.
    const byName = { ...ref, payerDocument: null };
    expect(salaryMatch(pixIn(5000, { payerName: 'Empresa Ltda.' }), [byName])).toBe(byName);
    const byDescription = { ...ref, payerDocument: null, payerName: null };
    expect(salaryMatch(tx({ type: 'CREDIT', amount: 4800, description: 'TED RECEBIDA - EMPRESA 0001' }), [byDescription])).toBe(
      byDescription,
    );
  });

  it('gets its own alert and leaves the summary', () => {
    const salary = pixIn(5000, { payerDocument: ref.payerDocument });
    const { body, salaries } = summarizeArrivals([salary, pixIn(50)], { ...DEFAULT_BANK_ALERTS, salaries: [ref] });
    expect(salaries).toEqual([salary]);
    expect(plain(body)).toBe('Chegou 1 Pix recebido (R$ 50,00).');
  });

  it('is never guessed: without one pointed at, nothing is a salary', () => {
    expect(summarizeArrivals([pixIn(5000, { operationType: 'PORTABILIDADE_SALARIO' })], DEFAULT_BANK_ALERTS).salaries).toEqual([]);
  });
});
