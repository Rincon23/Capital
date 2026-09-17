import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, navKeysFor } from '../items';

describe('barra de navegação por módulos', () => {
  it('mantém as quatro abas de sempre para quem não ligou nenhum módulo', () => {
    expect(navKeysFor(undefined)).toEqual(['inicio', 'lancamentos', 'historico', 'configuracoes']);
    expect(navKeysFor({ reimbursable: true })).toEqual([
      'inicio',
      'lancamentos',
      'historico',
      'configuracoes',
    ]);
  });

  it('abre a aba Lembretes e move Histórico e Configurações para Mais', () => {
    expect(navKeysFor({ reminders: true })).toEqual(['inicio', 'lancamentos', 'lembretes', 'mais']);
  });

  it('com só o monitor de Gmail, abre Mais (é onde ele fica)', () => {
    expect(navKeysFor({ gmail: true })).toEqual(['inicio', 'lancamentos', 'mais']);
  });

  it.each(['recurring', 'installments', 'investments', 'cash'] as const)(
    'abre a aba Carteira com o módulo %s',
    (module) => {
      expect(navKeysFor({ [module]: true })).toEqual(['inicio', 'lancamentos', 'carteira', 'mais']);
    },
  );

  it('nunca passa de cinco abas, mesmo com tudo ligado', () => {
    const keys = navKeysFor({
      reimbursable: true,
      recurring: true,
      installments: true,
      investments: true,
      cash: true,
      reminders: true,
      voice: true,
      gmail: true,
    });
    expect(keys).toEqual(['inicio', 'lancamentos', 'lembretes', 'carteira', 'mais']);
    expect(keys.length).toBeLessThanOrEqual(5);
  });

  it('marca a aba certa como ativa', () => {
    expect(NAV_ITEMS.inicio.isActive('/mes/2026-09')).toBe(true);
    expect(NAV_ITEMS.inicio.isActive('/mes/2026-09/lancamentos')).toBe(false);
    expect(NAV_ITEMS.lancamentos.isActive('/mes/2026-09/lancamentos')).toBe(true);
    // "Mais" guarda o Histórico e as Configurações, então fica aceso nas duas.
    expect(NAV_ITEMS.mais.isActive('/historico')).toBe(true);
    expect(NAV_ITEMS.mais.isActive('/configuracoes')).toBe(true);
    expect(NAV_ITEMS.mais.isActive('/gmail')).toBe(true);
    expect(NAV_ITEMS.mais.isActive('/mes/2026-09')).toBe(false);
  });

  it('leva a Início e a Lançamentos do mês que está na tela', () => {
    expect(NAV_ITEMS.inicio.href('2026-09')).toBe('/mes/2026-09');
    expect(NAV_ITEMS.lancamentos.href('2026-09')).toBe('/mes/2026-09/lancamentos');
  });
});
