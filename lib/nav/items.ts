import { resolveModules, type BudgetSettings, type ModuleFlags, type Month } from '@/lib/budget';

export type NavKey =
  'inicio' | 'lancamentos' | 'lembretes' | 'carteira' | 'historico' | 'configuracoes' | 'mais';

export interface NavItem {
  key: NavKey;
  label: string;
  /** Anchor for the onboarding tour (`data-tour`). */
  tourId: string;
  href: (month: Month) => string;
  isActive: (pathname: string) => boolean;
}

export const NAV_ITEMS: Record<NavKey, NavItem> = {
  inicio: {
    key: 'inicio',
    label: 'Início',
    tourId: 'nav-mes',
    href: (month) => `/mes/${month}`,
    isActive: (p) => p.startsWith('/mes/') && !p.includes('/lancamentos') && !p.includes('/categoria'),
  },
  lancamentos: {
    key: 'lancamentos',
    label: 'Lançamentos',
    tourId: 'nav-lancamentos',
    href: (month) => `/mes/${month}/lancamentos`,
    isActive: (p) => p.includes('/lancamentos'),
  },
  lembretes: {
    key: 'lembretes',
    label: 'Lembretes',
    tourId: 'nav-lembretes',
    href: () => '/lembretes',
    isActive: (p) => p.startsWith('/lembretes'),
  },
  carteira: {
    key: 'carteira',
    label: 'Carteira',
    tourId: 'nav-carteira',
    href: () => '/carteira',
    isActive: (p) => p.startsWith('/carteira'),
  },
  historico: {
    key: 'historico',
    label: 'Histórico',
    tourId: 'nav-historico',
    href: () => '/historico',
    isActive: (p) => p.startsWith('/historico'),
  },
  configuracoes: {
    key: 'configuracoes',
    label: 'Config.',
    tourId: 'nav-config',
    href: () => '/configuracoes',
    isActive: (p) => p.startsWith('/configuracoes'),
  },
  mais: {
    key: 'mais',
    label: 'Mais',
    tourId: 'nav-mais',
    href: () => '/mais',
    isActive: (p) =>
      p.startsWith('/mais') ||
      p.startsWith('/historico') ||
      p.startsWith('/configuracoes') ||
      p.startsWith('/gmail'),
  },
};

/** The modules that live behind the "Carteira" tab. */
function hasWallet(modules: ModuleFlags): boolean {
  return modules.recurring || modules.installments || modules.investments || modules.cash;
}

/**
 * Which tabs the bottom bar shows for this user. Nobody gets a tab for a module they did not
 * turn on, so an account with nothing on keeps the four tabs the app always had. As soon as
 * Lembretes or Carteira join, History and Settings move behind "Mais" — the bar never grows
 * past five tabs, which is as many as fit on a phone. The Gmail monitor has no tab of its own: it
 * lives in "Mais", so turning it on brings that tab too.
 */
export function navKeysFor(
  source: Pick<BudgetSettings, 'modules'> | Partial<ModuleFlags> | null | undefined,
): NavKey[] {
  const modules = resolveModules(source);
  const keys: NavKey[] = ['inicio', 'lancamentos'];
  if (modules.reminders) keys.push('lembretes');
  if (hasWallet(modules)) keys.push('carteira');
  if (keys.length > 2 || modules.gmail) keys.push('mais');
  else keys.push('historico', 'configuracoes');
  return keys;
}

export function navItemsFor(
  source: Pick<BudgetSettings, 'modules'> | Partial<ModuleFlags> | null | undefined,
): NavItem[] {
  return navKeysFor(source).map((key) => NAV_ITEMS[key]);
}
