// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULE_KEYS } from '../catalog';
import { MODULE_TOURS, tourSteps } from '../tours';

/** Every .tsx under components/, as one string, to look for the tour anchors. */
function componentSources(): string {
  const root = path.join(process.cwd(), 'components');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== '__tests__') walk(full);
      } else if (name.endsWith('.tsx')) files.push(full);
    }
  };
  walk(root);
  return files.map((file) => readFileSync(file, 'utf8')).join('\n');
}

describe('tours dos módulos', () => {
  it('todo módulo tem tour', () => {
    for (const key of MODULE_KEYS) expect(MODULE_TOURS[key].length).toBeGreaterThan(0);
  });

  it('cada passo aponta para uma âncora que existe nas telas', () => {
    const sources = componentSources();
    const missing: string[] = [];
    for (const key of MODULE_KEYS) {
      for (const step of MODULE_TOURS[key]) {
        // The home cards get `card-<module>` from the card frame itself.
        const dynamicCard = step.anchor.startsWith('card-') && sources.includes('`card-${module}`');
        const literal = sources.includes(`"${step.anchor}"`) || sources.includes(`'${step.anchor}'`);
        if (!dynamicCard && !literal) missing.push(`${key}: ${step.anchor}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('todo módulo tem um botão de ajuda em algum lugar da tela', () => {
    const sources = componentSources();
    // The help button renders `data-tour={helpAnchor(module)}`; each module must place one.
    const missing = MODULE_KEYS.filter((key) => !sources.includes(`<ModuleHelpButton module="${key}"`));
    expect(missing).toEqual([]);
  });

  it('nunca aponta para o rodapé, que muda conforme a escolha de cada um', () => {
    const anchors = MODULE_KEYS.flatMap((key) => MODULE_TOURS[key].map((step) => step.anchor));
    expect(anchors.filter((anchor) => anchor.startsWith('nav-'))).toEqual([]);
  });

  it('monta as rotas do mês e marca de qual módulo é cada passo', () => {
    const steps = tourSteps(['card', 'reimbursable'], '2026-09');
    expect(steps.map((step) => [step.module, step.href, step.anchor])).toEqual([
      ['card', '/cartao', 'cartao-fatura'],
      ['card', '/cartao', 'cartao-lancamentos'],
      ['card', '/cartao', 'cartao-pagar'],
      ['card', '/cartao?aba=parcelados', 'cartao-aba-parcelados'],
      ['card', '/cartao?aba=cartoes', 'cartao-aba-cartoes'],
      ['card', '/cartao', 'cartao-config'],
      ['card', '/mes/2026-09', 'cartao-pergunta'],
      ['card', '/cartao', 'ajuda-card'],
      ['reimbursable', '/mes/2026-09', 'categoria-a-receber'],
      ['reimbursable', '/mes/2026-09/lancamentos?aba=a-receber', 'aba-a-receber'],
      ['reimbursable', '/mes/2026-09', 'card-reimbursable'],
      ['reimbursable', '/mes/2026-09/lancamentos?aba=a-receber', 'ajuda-reimbursable'],
    ]);
    // The card question is inside the expense form; the help button is not, so it closes first.
    expect(steps[6].sheet).toBe('expense-form');
    expect(steps[7].sheet).toBeUndefined();
  });

  it('o tour do Cartão é um só, curto, e passa pelas três abas', () => {
    const anchors = MODULE_TOURS.card.map((step) => step.anchor);
    expect(anchors).toContain('cartao-fatura');
    expect(anchors).toContain('cartao-aba-parcelados');
    expect(anchors).toContain('cartao-aba-cartoes');
    expect(anchors.length).toBeLessThanOrEqual(8);
  });
});
