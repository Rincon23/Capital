import type { ModuleKey } from '../budget/types';

/** A set of modules turned on with one tap, on "Como você quer usar o Capital?". */
export interface ModuleKit {
  key: 'spending' | 'spendingAndCard';
  name: string;
  /** One line: what the person gets. */
  line: string;
  /** In catalog order: each module after the ones it depends on. */
  modules: ModuleKey[];
}

/**
 * The first question of a new account (one with no module on). Picking a kit turns its modules on
 * together — the person asked for the whole set, so the parent comes on with its child (the one
 * exception to "the app never turns a parent on by itself") — and goes straight to setting up the
 * categories. The third card, "Escolher do meu jeito", is not a kit: it opens Módulos.
 */
export const MODULE_KITS: ModuleKit[] = [
  {
    key: 'spending',
    name: 'Controlar meus gastos',
    line: 'Lance os gastos e veja quanto ainda pode gastar.',
    modules: ['expenses', 'budget'],
  },
  {
    key: 'spendingAndCard',
    name: 'Gastos e cartão de crédito',
    line: 'O mesmo, mais a fatura do cartão.',
    modules: ['expenses', 'budget', 'card'],
  },
];
