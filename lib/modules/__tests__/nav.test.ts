import { describe, expect, it } from 'vitest';
import type { ModuleKey, NavKey } from '../../budget/types';
import {
  MAX_NAV_ITEMS,
  MORE_DIVIDER,
  activeNavKey,
  changeNav,
  homeCards,
  homeHref,
  moreItems,
  navEditorItems,
  navEntry,
  navFromEditor,
  resolveNav,
} from '../nav';

const on = (...keys: ModuleKey[]) => Object.fromEntries(keys.map((key) => [key, true]));
const everything = on(
  'expenses',
  'budget',
  'card',
  'reimbursable',
  'history',
  'recurring',
  'investments',
  'cash',
  'reminders',
  'voice',
  'gmail',
);

describe('rodapé', () => {
  it('sem nada ligado, fica só o Início (e o Mais)', () => {
    expect(resolveNav(undefined)).toEqual(['inicio']);
    expect(resolveNav({ modules: {} })).toEqual(['inicio']);
  });

  it('sem escolha salva, usa o Início e os primeiros módulos com tela, na ordem do catálogo', () => {
    expect(resolveNav({ modules: on('expenses', 'card', 'reminders') })).toEqual([
      'inicio',
      'expenses',
      'card',
      'reminders',
    ]);
    expect(resolveNav({ modules: everything })).toEqual(['inicio', 'expenses', 'budget', 'card']);
  });

  it('respeita a escolha, tirando módulos desligados e repetidos e cortando em quatro', () => {
    const nav: NavKey[] = ['reminders', 'gmail', 'reminders', 'card', 'cash', 'inicio', 'expenses'];
    expect(resolveNav({ modules: on('reminders', 'gmail', 'cash', 'expenses'), nav })).toEqual([
      'reminders',
      'gmail',
      'cash',
      'inicio',
    ]);
    expect(resolveNav({ modules: everything, nav }).length).toBe(MAX_NAV_ITEMS);
  });

  it('volta ao padrão se nada da escolha continua ligado', () => {
    expect(resolveNav({ modules: on('reminders'), nav: ['gmail'] })).toEqual(['inicio', 'reminders']);
  });

  it('não põe no rodapé módulo sem tela', () => {
    const nav = resolveNav({ modules: on('expenses', 'reimbursable', 'voice') });
    expect(nav).toEqual(['inicio', 'expenses']);
  });

  it('abre em "/" o primeiro item do rodapé', () => {
    expect(homeHref({ modules: on('reminders'), nav: ['reminders', 'inicio'] }, '2026-09')).toBe(
      '/lembretes',
    );
    expect(homeHref({ modules: on('expenses') }, '2026-09')).toBe('/mes/2026-09');
  });
});

describe('Mais', () => {
  it('lista todo módulo ligado com tela, agrupado, mesmo os que estão no rodapé', () => {
    const settings = { modules: everything, nav: ['expenses', 'reminders'] as NavKey[] };
    expect(moreItems(settings)).toEqual([
      { group: 'month', label: 'Dinheiro do mês', keys: ['expenses', 'budget', 'card', 'history'] },
      {
        group: 'wallet',
        label: 'Carteira',
        keys: ['recurring', 'investments', 'cash'],
      },
      { group: 'assistant', label: 'Assistente', keys: ['reminders', 'gmail'] },
    ]);
  });

  it('não lista módulo desligado nem módulo sem tela', () => {
    expect(moreItems({ modules: on('expenses', 'reimbursable', 'voice') })).toEqual([
      { group: 'month', label: 'Dinheiro do mês', keys: ['expenses'] },
    ]);
    expect(moreItems({ modules: {} })).toEqual([]);
  });
});

describe('aba acesa', () => {
  const nav: NavKey[] = ['inicio', 'expenses', 'budget'];

  it('acende a aba da tela aberta', () => {
    expect(activeNavKey(nav, '/mes/2026-09')).toBe('inicio');
    expect(activeNavKey(nav, '/mes/2026-09/lancamentos')).toBe('expenses');
    expect(activeNavKey(nav, '/mes/2026-09/categorias')).toBe('budget');
    expect(activeNavKey(nav, '/mes/2026-09/categoria/abc')).toBe('budget');
  });

  it('acende o Mais para telas abertas por ele', () => {
    expect(activeNavKey(nav, '/cartao')).toBe('mais');
    expect(activeNavKey(nav, '/configuracoes')).toBe('mais');
    expect(activeNavKey(nav, '/modulos')).toBe('mais');
    expect(activeNavKey(['expenses'], '/mes/2026-09')).toBe('mais');
    expect(activeNavKey(nav, '/')).toBeNull();
  });

  it('leva ao mês que está na tela', () => {
    expect(navEntry('inicio').href('2026-09')).toBe('/mes/2026-09');
    expect(navEntry('expenses').href('2026-09')).toBe('/mes/2026-09/lancamentos');
    expect(navEntry('budget').href('2026-09')).toBe('/mes/2026-09/categorias');
  });
});

describe('cards do Início', () => {
  it('seguem o rodapé e depois o Mais, com Cartão e A receber logo depois de quem eles dependem', () => {
    const settings = { modules: everything, nav: ['reminders', 'expenses', 'inicio'] as NavKey[] };
    expect(homeCards(settings)).toEqual([
      'reminders',
      'expenses',
      'budget',
      'card',
      'reimbursable',
      'history',
      'recurring',
      'investments',
      'cash',
      'gmail',
    ]);
  });

  it('não tem card de módulo desligado nem da voz', () => {
    expect(homeCards({ modules: on('expenses', 'voice') })).toEqual(['expenses']);
    expect(homeCards({ modules: {} })).toEqual([]);
  });
});

describe('editor do rodapé', () => {
  it('lista o rodapé, a divisória do Mais e o resto', () => {
    expect(
      navEditorItems({ modules: on('expenses', 'reminders', 'gmail'), nav: ['reminders', 'inicio'] }),
    ).toEqual(['reminders', 'inicio', MORE_DIVIDER, 'expenses', 'gmail']);
  });

  it('arrastar para cima da divisória põe no rodapé, na posição em que soltou', () => {
    expect(navFromEditor(['reminders', 'gmail', 'inicio', MORE_DIVIDER, 'expenses'], 'gmail')).toEqual({
      ok: true,
      nav: ['reminders', 'gmail', 'inicio'],
      bumped: null,
    });
  });

  it('com o rodapé cheio, o último outro item vai para o Mais', () => {
    const items = ['inicio', 'expenses', 'cash', 'budget', 'gmail', MORE_DIVIDER, 'history'] as const;
    expect(navFromEditor([...items], 'cash')).toEqual({
      ok: true,
      nav: ['inicio', 'expenses', 'cash', 'budget'],
      bumped: 'gmail',
    });
    // The item just dragged is never the one pushed out, even when it is the last.
    expect(
      navFromEditor(['inicio', 'expenses', 'budget', 'history', 'gmail', MORE_DIVIDER], 'gmail'),
    ).toEqual({
      ok: true,
      nav: ['inicio', 'expenses', 'budget', 'gmail'],
      bumped: 'history',
    });
  });

  it('não deixa o rodapé vazio', () => {
    expect(navFromEditor([MORE_DIVIDER, 'inicio', 'expenses'], 'inicio')).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(changeNav(['inicio'], 'inicio', 'remove')).toEqual({ ok: false, reason: 'empty' });
  });

  it('sobe, desce, põe e tira pelos botões', () => {
    expect(changeNav(['inicio', 'expenses'], 'expenses', 'up')).toEqual({
      ok: true,
      nav: ['expenses', 'inicio'],
      bumped: null,
    });
    expect(
      changeNav(['inicio', 'expenses'], 'inicio', 'down').ok &&
        changeNav(['inicio', 'expenses'], 'inicio', 'down'),
    ).toEqual({
      ok: true,
      nav: ['expenses', 'inicio'],
      bumped: null,
    });
    expect(changeNav(['inicio'], 'gmail', 'add')).toEqual({
      ok: true,
      nav: ['inicio', 'gmail'],
      bumped: null,
    });
    expect(changeNav(['inicio', 'expenses', 'budget', 'history'], 'gmail', 'add')).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(changeNav(['inicio', 'gmail'], 'inicio', 'remove')).toEqual({
      ok: true,
      nav: ['gmail'],
      bumped: null,
    });
  });

  it('acende o Mais na tela do rodapé', () => {
    expect(activeNavKey(['inicio'], '/rodape')).toBe('mais');
  });
});
