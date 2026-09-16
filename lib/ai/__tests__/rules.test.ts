import { describe, expect, it } from 'vitest';
import {
  buildDraftResult,
  buildPrompt,
  buildPromptPrefix,
  categoryOptions,
  cleanTranscript,
  detectCard,
  detectDate,
  DRAFT_WARNINGS,
  fieldsForModel,
  findAmount,
  findCategory,
  parseModelOutput,
  readExpenseText,
  responseSchema,
  type CategoryOption,
  type ModelReading,
} from '../index';

const TODAY = '2026-09-16'; // a Wednesday

const settings = {
  topics: [
    { id: 't-div', name: 'Diversos', targetPct: 0.2, order: 0 },
    { id: 't-inv', name: 'Investimentos', targetPct: 0.45, order: 1 },
    { id: 't-met', name: 'Metas', targetPct: 0.25, order: 2 },
    { id: 't-con', name: 'Conhecimentos', targetPct: 0.1, order: 3 },
    { id: 't-old', name: 'Viagem', targetPct: 0, order: 4, archived: true },
  ],
  specialCategories: { fixedCost: 'Custo Fixo', unforeseen: 'Imprevistos' },
  modules: { reimbursable: true },
};
const options = categoryOptions(settings);
const byKind = (kind: string, topicId?: string) =>
  options.find((o) => o.categoryKind === kind && o.topicId === topicId) as CategoryOption;

/** What the draft would be with the AI answering only `model`. */
function draftFor(text: string, model: ModelReading | null = {}) {
  const reading = readExpenseText(cleanTranscript(text), options, TODAY);
  return buildDraftResult(text, reading, model);
}

describe('categoryOptions', () => {
  it('lists the active envelopes, the special categories and "A receber" when it is on', () => {
    expect(options.map((o) => o.label)).toEqual([
      'Diversos',
      'Investimentos',
      'Metas',
      'Conhecimentos',
      'Custo Fixo',
      'Imprevistos',
      'A receber',
    ]);
    expect(categoryOptions({ ...settings, modules: {} }).map((o) => o.label)).not.toContain('A receber');
  });
});

describe('the four examples of the bot prompt', () => {
  it('"Gastei 30 reais no uber, categoria diversos"', () => {
    const result = draftFor('Gastei 30 reais no uber, categoria diversos', { description: 'Uber' });
    expect(result.draft).toEqual({
      categoryKind: 'topic',
      topicId: 't-div',
      description: 'Uber',
      amount: 30,
      date: TODAY,
      card: false,
    });
    expect(result.warnings).toEqual([]);
  });

  it('"Gastei 50 reais e 30 centavos no mercado ontem no débito, categoria diversos"', () => {
    const result = draftFor('Gastei 50 reais e 30 centavos no mercado ontem no débito, categoria diversos', {
      description: 'Mercado',
    });
    expect(result.draft).toMatchObject({ topicId: 't-div', amount: 50.3, date: '2026-09-15', card: false });
  });

  it('"Paguei 120 e 99 de conta de luz hoje no pix, custos fixos"', () => {
    const result = draftFor('Paguei 120 e 99 de conta de luz hoje no pix, custos fixos', {
      description: 'Conta de luz',
    });
    expect(result.draft).toMatchObject({
      categoryKind: 'fixedCost',
      topicId: undefined,
      description: 'Conta de luz',
      amount: 120.99,
      date: TODAY,
      card: false,
    });
  });

  it('"Comprei um livro de 40 reais e 30 no cartão antes de ontem, categoria conhecimento"', () => {
    const result = draftFor(
      'Comprei um livro de 40 reais e 30 no cartão antes de ontem, categoria conhecimento',
      { description: 'Livro' },
    );
    expect(result.draft).toMatchObject({ topicId: 't-con', amount: 40.3, date: '2026-09-14', card: true });
  });

  it('only asks the AI for the description when the rules settle everything else', () => {
    const reading = readExpenseText('Gastei 30 reais no uber, categoria diversos', options, TODAY);
    expect(fieldsForModel(reading)).toEqual(['description']);
  });
});

describe('what the small model got wrong in the Orange Pi test', () => {
  it('reads "89 e 90" as 89,90', () => {
    expect(draftFor('Paguei 89 e 90 no ifood no crédito, imprevisto').draft).toMatchObject({
      categoryKind: 'unforeseen',
      amount: 89.9,
      card: true,
    });
  });

  it('files "ele vai me devolver" under "A receber", always on the card', () => {
    expect(draftFor('Almoço de 45 reais pro João, ele vai me devolver').draft).toMatchObject({
      categoryKind: 'reimbursable',
      amount: 45,
      card: true,
    });
  });
});

describe('findCategory', () => {
  it('ignores case, accents and singular/plural', () => {
    expect(findCategory('CUSTO FIXO', options).option).toEqual(byKind('fixedCost'));
    expect(findCategory('imprevisto', options).option).toEqual(byKind('unforeseen'));
    expect(findCategory('na meta', options).option).toEqual(byKind('topic', 't-met'));
    expect(findCategory('investimento', options).option).toEqual(byKind('topic', 't-inv'));
  });

  it('joins the words whisper split across segments', () => {
    const text = cleanTranscript(' Comprei um livro de R$ 40 no cartão, categoria conhec\nimentos.\n');
    expect(findCategory(text, options).option).toEqual(byKind('topic', 't-con'));
  });

  it('still recognizes the usual name of a renamed special category', () => {
    const renamed = categoryOptions({
      ...settings,
      specialCategories: { fixedCost: 'Contas da casa', unforeseen: 'Emergências' },
    });
    expect(findCategory('conta de luz, custos fixos', renamed).option?.categoryKind).toBe('fixedCost');
    expect(findCategory('remédio, emergência', renamed).option?.categoryKind).toBe('unforeseen');
  });

  it('prefers the name after "categoria" and a name over a synonym of "A receber"', () => {
    expect(findCategory('mercado para as metas da casa, categoria diversos', options).option).toEqual(
      byKind('topic', 't-div'),
    );
    expect(findCategory('ele vai me devolver, categoria metas', options).option).toEqual(
      byKind('topic', 't-met'),
    );
  });

  it('leaves it open when two categories are said the same way', () => {
    const reading = findCategory('diversos ou metas', options);
    expect(reading.option).toBeUndefined();
    expect(reading.mentioned).toHaveLength(2);
  });

  it('ignores "A receber" synonyms when the module is off', () => {
    const withoutReimbursable = categoryOptions({ ...settings, modules: {} });
    expect(findCategory('ele vai me devolver', withoutReimbursable).option).toBeUndefined();
  });
});

describe('findAmount', () => {
  it.each([
    ['Comprei um livro de R$ 40 no cartão', 40],
    ['R$ 1.200,50 no aluguel', 1200.5],
    ['gastei 89,90 na farmácia', 89.9],
    ['uma bala de 30 centavos', 0.3],
    ['50 e 30 centavos', 50.3],
    ['gastei 30 no uber', 30],
    ['duas pizzas de 45 reais', 45],
    ['dia 12 paguei 50 de gás', 50],
    ['celular em 12x de 150 reais', 150],
    ['no dia 12/09 gastei 20', 20],
  ])('"%s" → %s', (text, value) => {
    expect(findAmount(text).value).toBe(value);
  });

  it('leaves it open when two different amounts are said the same way', () => {
    expect(findAmount('30 reais no uber e 20 reais no almoço').value).toBeUndefined();
    expect(findAmount('mercado').value).toBeUndefined();
  });
});

describe('detectCard', () => {
  it.each([
    ['no cartão', true],
    ['no crédito', true],
    ['no cartão de débito', false],
    ['no pix', false],
    ['em dinheiro', false],
    ['almoço', false],
  ])('"%s" → %s', (text, card) => {
    expect(detectCard(text)).toBe(card);
  });
});

describe('detectDate', () => {
  it.each([
    ['gastei 30', TODAY],
    ['hoje', TODAY],
    ['ontem', '2026-09-15'],
    ['anteontem', '2026-09-14'],
    ['antes de ontem', '2026-09-14'],
    ['na segunda', '2026-09-14'],
    ['sexta-feira', '2026-09-11'],
    ['quarta-feira', TODAY],
    ['no sábado', '2026-09-12'],
    ['dia 10', '2026-09-10'],
    ['dia 20', '2026-08-20'],
    ['dia 31', '2026-08-31'],
    ['dia 5 de setembro', '2026-09-05'],
    ['12/10', '2025-10-12'],
  ])('"%s" → %s', (text, date) => {
    expect(detectDate(text, TODAY)).toBe(date);
  });

  it('does not take "segunda" alone as a weekday ("segunda parcela")', () => {
    expect(detectDate('segunda parcela da geladeira', TODAY)).toBe(TODAY);
  });
});

describe('without the AI', () => {
  it('builds the description from the words and says so', () => {
    const result = draftFor('Paguei 120 e 99 de conta de luz hoje no pix, custos fixos', null);
    expect(result.draft.description).toBe('Conta de luz');
    expect(result.warnings).toEqual([DRAFT_WARNINGS.aiOffline]);
    expect(draftFor('Gastei 50 reais e 30 centavos no mercado ontem no débito', null).draft.description).toBe(
      'Mercado',
    );
  });

  it('warns about a missing category or value instead of guessing', () => {
    const result = draftFor('gastei no mercado', { description: 'Mercado' });
    expect(result.draft.categoryKind).toBeUndefined();
    expect(result.draft.amount).toBeUndefined();
    expect(result.warnings).toEqual([DRAFT_WARNINGS.noCategory, DRAFT_WARNINGS.noAmount]);
  });

  it('takes the category and the value from the AI when the rules could not', () => {
    const reading = readExpenseText('gastei uns trocados no mercado', options, TODAY);
    expect(fieldsForModel(reading)).toEqual(['category', 'description', 'amount']);
    const result = buildDraftResult('…', reading, {
      category: byKind('topic', 't-div'),
      description: 'Mercado',
      amount: 12,
    });
    expect(result.draft).toMatchObject({ topicId: 't-div', amount: 12 });
    expect(result.aiFields).toEqual(['category', 'amount', 'description']);
  });
});

describe('prompt', () => {
  const prefix = buildPromptPrefix(options, TODAY);

  it("uses the user's own categories and São Paulo dates in the rules and the examples", () => {
    expect(prefix).toContain(
      'categoria (uma dessas: Diversos, Investimentos, Metas, Conhecimentos, Custo Fixo, Imprevistos, A receber)',
    );
    expect(prefix).toContain('A data de hoje é 16-09-2026.');
    expect(prefix).toContain('Texto: "Paguei 120 e 99 de conta de luz hoje no pix, custos fixos"');
    expect(prefix).toContain(
      'Resposta: {"categoria":"Investimentos","descricao":"mercado","data":"15-09-2026","valor":50.30,"cartao":false}',
    );
    expect(prefix).toContain('"categoria":"Conhecimentos","descricao":"livro","data":"14-09-2026"');
    expect(prefix).toContain('Use "A receber" quando outra pessoa vai devolver o dinheiro');
    expect(prefix).not.toMatch(/Ressarcido|Liberdade Financeira/);
  });

  it('ends with the text, quoted', () => {
    expect(buildPrompt(prefix, 'uber "x"').endsWith('Texto: "uber \\"x\\""\nResposta:')).toBe(true);
  });

  it('constrains the answer to the open fields and the category to the user list', () => {
    expect(responseSchema(['description'], options)).toEqual({
      type: 'object',
      properties: { descricao: { type: 'string' } },
      required: ['descricao'],
    });
    const schema = responseSchema(['amount', 'category', 'description'], options) as {
      properties: Record<string, { enum?: string[] }>;
      required: string[];
    };
    expect(schema.required).toEqual(['categoria', 'descricao', 'valor']);
    expect(schema.properties.categoria.enum).toContain('A receber');
  });
});

describe('parseModelOutput', () => {
  it('reads a valid answer', () => {
    expect(
      parseModelOutput(
        '{"categoria":"custos fixos","descricao":"conta de luz","data":"15-09-2026","valor":120.99,"cartao":false}',
        options,
        TODAY,
      ),
    ).toEqual({
      category: byKind('fixedCost'),
      description: 'Conta de luz',
      date: '2026-09-15',
      amount: 120.99,
      card: false,
    });
  });

  it('drops what cannot be trusted', () => {
    expect(
      parseModelOutput(
        '{"categoria":"Liberdade Financeira","descricao":"  ","data":"20-09-2026","valor":0}',
        options,
        TODAY,
      ),
    ).toEqual({});
    expect(parseModelOutput('não é json', options, TODAY)).toEqual({});
    expect(parseModelOutput('{"descricao":"João (A receber)"}', options, TODAY)).toEqual({
      description: 'João',
    });
    expect(parseModelOutput('{"descricao":"diversos"}', options, TODAY)).toEqual({});
    expect(parseModelOutput('{"valor":"50,30","data":"31-02-2026"}', options, TODAY)).toEqual({
      amount: 50.3,
    });
  });
});
