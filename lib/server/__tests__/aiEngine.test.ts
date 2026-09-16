// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { categoryOptions, DRAFT_WARNINGS, type AiProgressEvent } from '@/lib/ai';
import { analyzeExpense, AnalysisError, engineState, resetEngineState, warmUp } from '../ai/engine';
import { JsonEnd, type ExpenseExtractor, type GenerateOptions, type Transcriber } from '../ai/providers';

const TODAY = '2026-09-16';
const options = categoryOptions({
  topics: [
    { id: 't-div', name: 'Diversos', targetPct: 0.5, order: 0 },
    { id: 't-met', name: 'Metas', targetPct: 0.5, order: 1 },
  ],
  specialCategories: { fixedCost: 'Custo Fixo', unforeseen: 'Imprevistos' },
  modules: {},
});

/** A fake Ollama that answers `answer` token by token and records what it was asked. */
function fakeExtractor(answer: string | Error, { loaded = true } = {}) {
  const calls: Array<{ prompt: string; options: GenerateOptions }> = [];
  let isLoaded = loaded;
  const extractor: ExpenseExtractor = {
    isLoaded: async () => isLoaded,
    load: async () => {
      isLoaded = true;
    },
    generate: async (prompt, generateOptions) => {
      calls.push({ prompt, options: generateOptions });
      if (answer instanceof Error) throw answer;
      const pieces = answer.match(/.{1,4}/g) ?? [];
      pieces.forEach((_, index) => {
        if (index === 0) generateOptions.onFirstToken?.();
        generateOptions.onToken?.(index + 1);
      });
      return { text: answer, tokens: pieces.length };
    },
  };
  return { extractor, calls };
}

const transcriber = (text: string | Error): Transcriber => ({
  transcribe: async () => {
    if (text instanceof Error) throw text;
    return text;
  },
});

async function run(
  input: Parameters<typeof analyzeExpense>[0],
  deps: { transcriber: Transcriber; extractor: ExpenseExtractor },
) {
  const events: AiProgressEvent[] = [];
  await analyzeExpense(
    input,
    { options, today: TODAY, signal: new AbortController().signal },
    deps,
    (event) => events.push(event),
  );
  return events;
}

beforeEach(() => resetEngineState());

describe('analyzeExpense', () => {
  it('audio: plans the steps, reports each one and returns the draft', async () => {
    const { extractor, calls } = fakeExtractor('{"descricao":"mercado"}');
    const events = await run(
      { kind: 'audio', audio: new Blob(['x']), filename: 'gasto.webm', seconds: 8 },
      {
        transcriber: transcriber(
          ' Gastei 50 reais e 30 centavos no mercado ontem no débito,\n categoria diversos.\n',
        ),
        extractor,
      },
    );

    const plan = events[0];
    expect(plan.type).toBe('plan');
    expect(plan.type === 'plan' && plan.stages.map((s) => s.stage)).toEqual(['transcribe', 'read', 'write']);
    expect(events.filter((e) => e.type === 'stage').map((e) => e.type === 'stage' && e.stage)).toEqual([
      'transcribe',
      'read',
      'write',
    ]);
    expect(events).toContainEqual({
      type: 'transcript',
      text: 'Gastei 50 reais e 30 centavos no mercado ontem no débito, categoria diversos.',
    });
    expect(events.some((e) => e.type === 'tokens')).toBe(true);

    const done = events.at(-1);
    expect(done?.type === 'done' && done.result.draft).toEqual({
      categoryKind: 'topic',
      topicId: 't-div',
      description: 'Mercado',
      amount: 50.3,
      date: '2026-09-15',
      card: false,
    });
    // Only the description was asked of the model, with the user's categories in the prompt.
    expect(calls[0].options.schema).toEqual({
      type: 'object',
      properties: { descricao: { type: 'string' } },
      required: ['descricao'],
    });
    expect(calls[0].prompt).toContain('categoria (uma dessas: Diversos, Metas, Custo Fixo, Imprevistos)');
  });

  it('text: loads the model first when Ollama had unloaded it', async () => {
    const { extractor } = fakeExtractor('{"descricao":"uber"}', { loaded: false });
    const events = await run(
      { kind: 'text', text: 'Gastei 30 reais no uber, categoria diversos' },
      { transcriber: transcriber(new Error('unused')), extractor },
    );
    expect(events.filter((e) => e.type === 'stage').map((e) => e.type === 'stage' && e.stage)).toEqual([
      'load',
      'read',
      'write',
    ]);
  });

  it('re-plans when the model has to answer more than the description', async () => {
    const { extractor, calls } = fakeExtractor('{"categoria":"Metas","descricao":"tênis","valor":199}');
    const events = await run(
      { kind: 'text', text: 'comprei um tênis' },
      { transcriber: transcriber(''), extractor },
    );
    expect(events.filter((e) => e.type === 'plan')).toHaveLength(2);
    expect(calls[0].options.schema).toMatchObject({ required: ['categoria', 'descricao', 'valor'] });
    const done = events.at(-1);
    expect(done?.type === 'done' && done.result.draft).toMatchObject({ topicId: 't-met', amount: 199 });
  });

  it('still returns a draft, with a warning, when Ollama fails', async () => {
    const { extractor } = fakeExtractor(new Error('connection refused'));
    const events = await run(
      { kind: 'text', text: 'Paguei 120 e 99 de conta de luz hoje no pix, custos fixos' },
      { transcriber: transcriber(''), extractor },
    );
    const done = events.at(-1);
    expect(done?.type === 'done' && done.result.draft.description).toBe('Conta de luz');
    expect(done?.type === 'done' && done.result.warnings).toEqual([DRAFT_WARNINGS.aiOffline]);
  });

  it('skips the AI steps when Ollama is unreachable', async () => {
    const extractor: ExpenseExtractor = {
      isLoaded: async () => {
        throw new Error('down');
      },
      load: async () => {},
      generate: async () => ({ text: '', tokens: 0 }),
    };
    const events = await run(
      { kind: 'text', text: '30 reais no uber, diversos' },
      { transcriber: transcriber(''), extractor },
    );
    expect(events[0]).toEqual({ type: 'plan', stages: [], msPerToken: expect.any(Number) });
    expect(events.at(-1)?.type).toBe('done');
  });

  it('fails clearly when whisper is down or heard nothing', async () => {
    const { extractor } = fakeExtractor('{}');
    const audio = { kind: 'audio' as const, audio: new Blob(['x']), filename: 'a.webm', seconds: 3 };
    await expect(
      run(audio, { transcriber: transcriber(new Error('down')), extractor }),
    ).rejects.toMatchObject({
      code: 'TRANSCRIBE_FAILED',
    });
    await expect(
      run(audio, { transcriber: transcriber(' [BLANK_AUDIO]\n'), extractor }),
    ).rejects.toBeInstanceOf(AnalysisError);
  });
});

describe('JsonEnd', () => {
  it('spots the end of the object as it streams, ignoring braces inside strings', () => {
    const end = new JsonEnd();
    expect(['{"desc', 'ricao":"', 'chave } {', '"', '}'].map((piece) => end.feed(piece))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

describe('warmUp', () => {
  it('reads the prompt start once and then counts it as warm', async () => {
    const { extractor, calls } = fakeExtractor('{');
    await warmUp(extractor, 'PREFIXO');
    await warmUp(extractor, 'PREFIXO');
    expect(calls.map((c) => c.prompt)).toEqual(['PREFIXO']);
    expect(engineState().lastPrefix?.prefix).toBe('PREFIXO');
  });
});
