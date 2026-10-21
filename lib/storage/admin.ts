import type { AdminOverview } from '../admin/types';
import type { ModuleKey } from '../budget/types';
import { apiRequest, seg } from './apiClient';

/** Administração (owner only): the server's health, every account and every module's "Só VIP". */
export const adminRepository = {
  overview: () => apiRequest<AdminOverview>('GET', '/admin'),
  setVip: (userId: string, vip: boolean) =>
    apiRequest<{ vip: boolean }>('PUT', `/admin/users/${seg(userId)}/vip`, { vip }),
  /** `turnedOff`: the accounts without VIP that had the module on, now off. */
  setModuleVip: (key: ModuleKey, vipOnly: boolean) =>
    apiRequest<{ vipOnly: boolean; turnedOff: number }>('PUT', `/admin/modules/${seg(key)}/vip`, { vipOnly }),
};
