import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { buildReview } from '../../banks/review';
import type { StoredTransaction } from '../../banks/repository';
import { bankConnections, bankKeys } from '../../db/schema';
import { lastRun } from '../../jobRuns';
import { schedulerRunning } from '../../scheduler';
import { expect, expectEqual, type SelfCheck } from '../check';

/** Open Finance. */

/** The banks are read once an hour; past this, the reading stopped. */
const BANKS_LATE_MS = 2 * 60 * 60 * 1000;

function transaction(
  overrides: Partial<StoredTransaction> & Pick<StoredTransaction, 'date'>,
): StoredTransaction {
  return {
    transactionId: `autoteste-${randomUUID()}`,
    accountId: 'conta',
    amount: -10,
    currency: 'BRL',
    description: 'ALGO',
    descriptionRaw: null,
    type: 'DEBIT',
    status: 'POSTED',
    category: null,
    operationType: null,
    paymentMethod: null,
    payerName: null,
    payerDocument: null,
    receiverName: null,
    receiverDocument: null,
    merchantName: null,
    installmentNumber: null,
    totalInstallments: null,
    purchaseDate: null,
    billId: null,
    ...overrides,
  };
}

export const banksChecks: SelfCheck[] = [
  {
    id: 'banks.review',
    name: 'Conferência separa o que lançar do que fica de fora',
    run: ({ scratch }) =>
      scratch(async ({ banks, budget, wallet, today }) => {
        await banks.addPending('autoteste', null);
        await banks.updateConnection('autoteste', { status: 'ok', suggestedName: 'Banco do autoteste' });
        await banks.replaceAccounts('autoteste', [
          { accountId: 'conta', kind: 'checking', name: 'Conta', balance: 100, currency: 'BRL' },
          { accountId: 'cartao', kind: 'card', name: 'Cartão', balance: 300, currency: 'BRL' },
        ]);
        const purchase = transaction({
          accountId: 'cartao',
          amount: 45.9,
          description: 'IFOOD',
          date: today,
        });
        const pix = transaction({
          amount: 50,
          type: 'CREDIT',
          paymentMethod: 'PIX',
          payerName: 'João',
          date: today,
        });
        const billPayment = transaction({
          amount: -1200,
          category: 'Credit card payment',
          description: 'PAGAMENTO FATURA',
          date: today,
        });
        await banks.upsertTransactions([purchase, pix, billPayment]);

        const review = await buildReview({ banks, repo: budget, wallet }, { today });
        const keys = (items: { key: string }[]) => items.map((item) => item.key);
        expect(
          keys(review.expenses.missing).includes(purchase.transactionId),
          'A compra no cartão não apareceu para lançar.',
        );
        expect(
          keys(review.incomes.missing).includes(pix.transactionId),
          'O Pix recebido não apareceu para lançar.',
        );
        const leftOut = review.expenses.leftOut.find((item) => item.key === billPayment.transactionId);
        expectEqual(leftOut?.leftOut?.reason, 'bill_payment', 'Pagamento de fatura (fica de fora sozinho)');
      }),
  },
  {
    id: 'banks.sync',
    name: 'Leitura dos bancos em dia',
    async run({ db, now }) {
      const [{ people }] = await db.select({ people: count() }).from(bankKeys);
      if (people === 0) return { status: 'skip', message: 'Ninguém ligou o Open Finance ainda.' };
      if (!schedulerRunning())
        return { status: 'skip', message: 'As tarefas em segundo plano estão desligadas aqui.' };
      const last = await lastRun(db, 'banks');
      expect(
        last && now.getTime() - last.getTime() < BANKS_LATE_MS,
        last
          ? `A leitura dos bancos não roda desde ${last.toLocaleString('pt-BR')}.`
          : 'A leitura dos bancos nunca rodou.',
      );
      const [{ failing }] = await db
        .select({ failing: count() })
        .from(bankConnections)
        .where(eq(bankConnections.status, 'error'));
      if (failing > 0) {
        return {
          status: 'warn',
          message: `${failing === 1 ? '1 banco deu' : `${failing} bancos deram`} erro na última leitura (a Pluggy tenta de novo).`,
        };
      }
    },
  },
];
