/** One entry in the changelog notified through the bell (see `lib/server/announcements.ts`). */
export interface FeatureAnnouncement {
  /** Stable id, never reused or renamed once shipped: becomes the notification's `sourceKey`. */
  key: string;
  title: string;
  body: string;
  href?: string;
  /**
   * When this shipped (ISO instant). Only accounts created before it are notified — a brand-new
   * account starts already caught up, since everything in the app is new to it anyway.
   */
  publishedAt: string;
}

/**
 * Every user-visible feature Capital has announced through the bell, oldest first. Whenever a
 * new module, screen or button ships that existing users should hear about, add an entry here —
 * `lib/server/announcements.ts` notifies every account created before `publishedAt`; anyone who
 * signs up afterwards never sees it, because their app was already born with it.
 */
export const FEATURE_ANNOUNCEMENTS: FeatureAnnouncement[] = [
  {
    key: 'notification-center',
    title: '🔔 Central de notificações',
    body: 'Agora o Capital guarda um histórico de tudo que já te avisou. Toque no sino para ver.',
    href: '/notificacoes',
    publishedAt: '2026-09-18T12:00:00Z',
  },
  {
    key: 'cards-module',
    title: '💳 Módulo Cartões',
    body:
      'Cadastre seus cartões, veja quando cada fatura vence e marque como paga — o Capital avisa antes do vencimento.',
    href: '/carteira/cartoes',
    publishedAt: '2026-09-19T12:00:00Z',
  },
  {
    key: 'card-single-module',
    title: '💳 Cartão agora é um módulo só',
    body:
      'Fatura, cartões e parcelados ficam juntos em Cartão. E ao lançar um gasto no cartão dá para parcelar na hora, escolhendo se o gasto conta todo no mês da compra ou parcela a parcela.',
    href: '/cartao',
    publishedAt: '2026-09-19T21:00:00Z',
  },
];
