import { describe, expect, it } from 'vitest';
import type { ModuleKey, NavKey } from '../../budget/types';
import { migrateCardModule } from '../migration';

/**
 * "Cartões" and "Parcelados" became part of "Cartão". Nobody who was already using them should
 * notice anything beyond the modules list getting shorter: the module stays on, and the entry
 * stays where it was in the bottom bar and in the Início order.
 */
describe('fusão dos módulos do cartão', () => {
  it('quem tinha Cartões ou Parcelados ligado passa a ter Cartão ligado', () => {
    const result = migrateCardModule({ modules: { expenses: true, cards: true } as never });
    expect(result.changed).toBe(true);
    expect(result.modules).toEqual({ expenses: true, card: true });
  });

  it('não liga Cartão para quem tinha as chaves gravadas como desligadas', () => {
    const result = migrateCardModule({
      modules: { expenses: true, cards: false, installments: false } as never,
    });
    expect(result.modules).toEqual({ expenses: true });
    expect(result.changed).toBe(true);
  });

  it('no rodapé e no Início, as duas chaves viram Cartão sem duplicar', () => {
    const result = migrateCardModule({
      modules: { card: true } as never,
      nav: ['inicio', 'cards', 'installments', 'expenses'] as NavKey[],
      homeOrder: ['cards', 'expenses', 'installments'] as ModuleKey[],
    });
    expect(result.nav).toEqual(['inicio', 'card', 'expenses']);
    expect(result.homeOrder).toEqual(['card', 'expenses']);
  });

  it('não mexe em quem já está migrado (roda de novo sem efeito)', () => {
    const settings = {
      modules: { expenses: true, card: true } as never,
      nav: ['inicio', 'card'] as NavKey[],
      homeOrder: null,
    };
    const first = migrateCardModule(settings);
    expect(first.changed).toBe(false);

    const second = migrateCardModule({
      modules: first.modules as never,
      nav: first.nav,
      homeOrder: first.homeOrder,
    });
    expect(second.changed).toBe(false);
    expect(second.modules).toEqual(first.modules);
  });
});
