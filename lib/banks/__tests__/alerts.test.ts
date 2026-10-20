import { describe, expect, it } from 'vitest';
import { alertSettingsOf, arrivalKind, DEFAULT_BANK_ALERTS, summarizeArrivals, type AlertTransaction } from '..';

/** The text without the non-breaking space formatBRL puts after R$. */
const plain = (text: string | null) => text?.replace(/ /g, ' ') ?? null;

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
  ...overrides,
});

const purchase = (amount: number) => tx({ accountKind: 'card', amount, operationType: 'PAGAMENTO' });
const pixIn = (amount: number) => tx({ amount, type: 'CREDIT', paymentMethod: 'PIX' });
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
    const body = summarizeArrivals([purchase(45.9), purchase(32.1), purchase(42), pixIn(50)], DEFAULT_BANK_ALERTS);
    expect(plain(body)).toBe('Chegaram 3 compras no cartão (R$ 120,00) e 1 Pix recebido (R$ 50,00).');
    expect(body).not.toMatch(/agora|na hora|tempo real/i);
  });

  it('follows the settings: kinds turned off and the minimum amount', () => {
    const settings = { ...DEFAULT_BANK_ALERTS, purchases: false, minAmount: 30 };
    expect(plain(summarizeArrivals([purchase(100), pixOut(20), pixOut(80)], settings))).toBe(
      'Chegou 1 Pix enviado (R$ 80,00).',
    );
    expect(summarizeArrivals([purchase(100)], settings)).toBeNull();
  });

  it('reads saved settings keeping only what exists (an older save had the salary alert)', () => {
    const older = { purchases: false, salary: true, salaries: [{ amount: 5000 }], minAmount: 0 } as never;
    expect(alertSettingsOf(older)).toEqual({ purchases: false, pixSent: true, pixReceived: true, minAmount: null });
    expect(alertSettingsOf(null)).toEqual(DEFAULT_BANK_ALERTS);
  });
});
