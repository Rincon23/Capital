import type { GmailKeyword, GmailOverview } from '../gmail/types';
import { apiRequest, seg } from './apiClient';

export interface GmailCheckResult {
  checked: number;
  alerts: number;
  status: 'ok' | 'error' | 'reconnect' | 'not_connected';
  error?: string;
}

/** Like `BudgetRepository`: the Monitor de Gmail screen only talks to this contract. */
export interface GmailRepository {
  getOverview(): Promise<GmailOverview>;
  addKeyword(keyword: string): Promise<GmailKeyword>;
  deleteKeyword(id: string): Promise<void>;
  checkNow(): Promise<GmailCheckResult>;
  disconnect(): Promise<void>;
}

/** Where "Conectar Gmail" sends the browser (a full page navigation, not a fetch). */
export const GMAIL_CONNECT_URL = '/api/v1/gmail/oauth/start';

export class HttpGmailRepository implements GmailRepository {
  getOverview(): Promise<GmailOverview> {
    return apiRequest('GET', '/gmail');
  }

  addKeyword(keyword: string): Promise<GmailKeyword> {
    return apiRequest('POST', '/gmail/keywords', { keyword });
  }

  deleteKeyword(id: string): Promise<void> {
    return apiRequest('DELETE', `/gmail/keywords/${seg(id)}`);
  }

  checkNow(): Promise<GmailCheckResult> {
    return apiRequest('POST', '/gmail/check');
  }

  disconnect(): Promise<void> {
    return apiRequest('DELETE', '/gmail/account');
  }
}
