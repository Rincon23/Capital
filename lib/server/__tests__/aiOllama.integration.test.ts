// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { categoryOptions, type AiProgressEvent, type ExpenseDraftResult } from '@/lib/ai';
import { analyzeExpense, resetEngineState } from '../ai/engine';
import { OllamaExtractor, type Transcriber } from '../ai/providers';

/**
 * Against the real Ollama on the Orange Pi. Off by default (it takes a minute and needs the
 * Pi); run with:  OLLAMA_TEST_URL=http://100.81.141.54:11434 npx vitest run aiOllama
 */
const url = process.env.OLLAMA_TEST_URL;
const TODAY = '2026-09-16';

const options = categoryOptions({
  topics: [
    { id: 't-div', name: 'Diversos', targetPct: 0.2, order: 0 },
    { id: 't-inv', name: 'Investimentos', targetPct: 0.45, order: 1 },
    { id: 't-met', name: 'Metas', targetPct: 0.25, order: 2 },
    { id: 't-con', name: 'Conhecimentos', targetPct: 0.1, order: 3 },
  ],
  specialCategories: { fixedCost: 'Custo Fixo', unforeseen: 'Imprevistos' },
  modules: { reimbursable: true },
});

const noTranscriber: Transcriber = { transcribe: async () => '' };

async function analyze(text: string): Promise<ExpenseDraftResult> {
  const extractor = new OllamaExtractor(url!, process.env.OLLAMA_MODEL || 'qwen2.5:1.5b');
  let result: ExpenseDraftResult | undefined;
  await analyzeExpense(
    { kind: 'text', text },
    { options, today: TODAY, signal: new AbortController().signal },
    { transcriber: noTranscriber, extractor },
    (event: AiProgressEvent) => {
      if (event.type === 'done') result = event.result;
    },
  );
  return result!;
}

describe.skipIf(!url)('Ollama real (Orange Pi)', () => {
  it.each([
    [
      'Gastei 30 reais no uber, categoria diversos',
      { topicId: 't-div', amount: 30, date: TODAY, card: false },
      /uber/i,
    ],
    [
      'Gastei 50 reais e 30 centavos no mercado ontem no débito, categoria diversos',
      { topicId: 't-div', amount: 50.3, date: '2026-09-15', card: false },
      /mercado/i,
    ],
    [
      'Paguei 120 e 99 de conta de luz hoje no pix, custos fixos',
      { categoryKind: 'fixedCost', amount: 120.99, date: TODAY, card: false },
      /luz/i,
    ],
    [
      'Comprei um livro de 40 reais e 30 no cartão antes de ontem, categoria conhecimento',
      { topicId: 't-con', amount: 40.3, date: '2026-09-14', card: true },
      /livro/i,
    ],
  ])(
    '"%s"',
    async (text, expected, description) => {
      resetEngineState();
      const result = await analyze(text);
      expect(result.draft).toMatchObject(expected);
      expect(result.draft.description).toMatch(description);
      expect(result.warnings).toEqual([]);
      expect(result.aiFields).toEqual(['description']);
    },
    120_000,
  );
});
