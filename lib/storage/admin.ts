import type { AdminOverview } from '../admin/types';
import { apiRequest, seg } from './apiClient';

/** Administração (owner only): the server's health and every account. */
export const adminRepository = {
  overview: () => apiRequest<AdminOverview>('GET', '/admin'),
  setVip: (userId: string, vip: boolean) =>
    apiRequest<{ vip: boolean }>('PUT', `/admin/users/${seg(userId)}/vip`, { vip }),
};
