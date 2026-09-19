import type {
  CardSettings,
  CashSettings,
  CreditCard,
  InstallmentPlan,
  InvestmentBucket,
  RecurringExpense,
} from '../budget/types';
import { apiRequest, seg } from './apiClient';
import type {
  AllocateInput,
  AssignCardInput,
  BillRef,
  UpfrontLaunch,
  WalletRepository,
  WalletSnapshot,
} from './wallet';

/** Browser-side WalletRepository: the Carteira screens against the app's own API. */
export class HttpWalletRepository implements WalletRepository {
  getSnapshot(): Promise<WalletSnapshot> {
    return apiRequest('GET', '/wallet');
  }

  saveRecurring(item: RecurringExpense): Promise<void> {
    return apiRequest('PUT', `/wallet/recurring/${seg(item.id)}`, item);
  }

  deleteRecurring(id: string): Promise<void> {
    return apiRequest('DELETE', `/wallet/recurring/${seg(id)}`);
  }

  saveInstallment(plan: InstallmentPlan, upfront?: UpfrontLaunch): Promise<void> {
    return apiRequest('PUT', `/wallet/installments/${seg(plan.id)}`, { plan, upfront });
  }

  deleteInstallment(id: string): Promise<void> {
    return apiRequest('DELETE', `/wallet/installments/${seg(id)}`);
  }

  saveCard(card: CreditCard): Promise<void> {
    return apiRequest('PUT', `/wallet/cards/${seg(card.id)}`, card);
  }

  deleteCard(id: string): Promise<void> {
    return apiRequest('DELETE', `/wallet/cards/${seg(id)}`);
  }

  payBill({ cardId, month }: BillRef): Promise<void> {
    return apiRequest('POST', `/wallet/cards/${seg(cardId)}/bills/${seg(month)}/pay`);
  }

  unpayBill({ cardId, month }: BillRef): Promise<void> {
    return apiRequest('DELETE', `/wallet/cards/${seg(cardId)}/bills/${seg(month)}/pay`);
  }

  assignMonthToCard({ cardId, month }: AssignCardInput): Promise<void> {
    return apiRequest('POST', `/wallet/cards/${seg(cardId)}/assign`, { month });
  }

  saveCardSettings(settings: CardSettings): Promise<void> {
    return apiRequest('PUT', '/wallet/cards/settings', settings);
  }

  setTicker(ticker: string): Promise<void> {
    return apiRequest('PUT', '/wallet/investments', { ticker });
  }

  tradeQuotas(delta: number): Promise<void> {
    return apiRequest('POST', '/wallet/investments/quotas', { delta });
  }

  saveBucket(bucket: InvestmentBucket): Promise<void> {
    return apiRequest('PUT', `/wallet/investments/buckets/${seg(bucket.id)}`, bucket);
  }

  deleteBucket(id: string): Promise<void> {
    return apiRequest('DELETE', `/wallet/investments/buckets/${seg(id)}`);
  }

  allocate(input: AllocateInput): Promise<void> {
    return apiRequest('POST', '/wallet/investments/allocate', input);
  }

  refreshPrice(): Promise<void> {
    return apiRequest('POST', '/wallet/investments/price');
  }

  saveCashSettings(settings: CashSettings): Promise<void> {
    return apiRequest('PUT', '/wallet/cash', settings);
  }
}
