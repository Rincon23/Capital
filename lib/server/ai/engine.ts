import 'server-only';
import {
  buildDraftResult,
  buildPrompt,
  buildPromptPrefix,
  cleanTranscript,
  DEFAULT_AI_TIMINGS,
  expectedTokens,
  fieldsForModel,
  learnTiming,
  parseModelOutput,
  promptTokens,
  readExpenseText,
  responseSchema,
  transcribeEstimate,
  type AiProgressEvent,
  type AiStage,
  type AiStagePlan,
  type AiTimings,
  type CategoryOption,
  type DraftField,
  type ISODate,
} from '@/lib/ai';
import type { ExpenseExtractor, Transcriber } from './providers';

/**
 * Runs one analysis (audio or text → draft) and tells the app what is happening on the Pi
 * as it goes. The engine also remembers, for the life of the process, how fast each step
 * has been and whether the prompt is still warm in Ollama's cache.
 */

/** Ollama unloads a model after 5 idle minutes; after 4, don't count on the cache. */
const WARM_WINDOW_MS = 4 * 60_000;
const AI_TIMEOUT_MS = 90_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;

interface Warming {
  prefix: string;
  phase: 'load' | 'read';
  promise: Promise<void>;
}

interface EngineState {
  timings: AiTimings;
  /** The last prompt start Ollama read, and when. */
  lastPrefix: { prefix: string; at: number } | null;
  warming: Warming | null;
}

const globalForAi = globalThis as unknown as { __capitalAiEngine?: EngineState };

export function engineState(): EngineState {
  globalForAi.__capitalAiEngine ??= { timings: { ...DEFAULT_AI_TIMINGS }, lastPrefix: null, warming: null };
  return globalForAi.__capitalAiEngine;
}

/** For tests. */
export function resetEngineState(): void {
  globalForAi.__capitalAiEngine = undefined;
}

export interface EngineDeps {
  transcriber: Transcriber;
  extractor: ExpenseExtractor;
  now?: () => number;
}

export class AnalysisError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

/**
 * Loads the model and reads the prompt's fixed start ahead of time, so the real request only
 * has the user's sentence left to read. Called when the voice sheet opens; does nothing when
 * the same start is already warm or on its way.
 */
export function warmUp(extractor: ExpenseExtractor, prefix: string, now = Date.now): Promise<void> {
  const state = engineState();
  if (state.warming?.prefix === prefix) return state.warming.promise;
  if (state.lastPrefix?.prefix === prefix && now() - state.lastPrefix.at < WARM_WINDOW_MS) {
    return Promise.resolve();
  }

  const signal = AbortSignal.timeout(AI_TIMEOUT_MS);
  const warming: Warming = { prefix, phase: 'load', promise: Promise.resolve() };
  warming.promise = (async () => {
    try {
      if (!(await extractor.isLoaded(signal))) {
        const started = now();
        await extractor.load(signal);
        state.timings.loadMs = learnTiming(state.timings.loadMs, now() - started);
      }
      warming.phase = 'read';
      const started = now();
      await extractor.generate(prefix, { maxTokens: 1, signal });
      state.timings.coldReadMsPerToken = learnTiming(
        state.timings.coldReadMsPerToken,
        (now() - started) / promptTokens(prefix),
      );
      state.lastPrefix = { prefix, at: now() };
    } catch (err) {
      console.warn('[ia] aquecimento falhou:', err instanceof Error ? err.message : err);
    } finally {
      if (state.warming === warming) state.warming = null;
    }
  })();
  state.warming = warming;
  return warming.promise;
}

export type AnalysisInput =
  { kind: 'audio'; audio: Blob; filename: string; seconds: number } | { kind: 'text'; text: string };

export interface AnalysisContext {
  options: CategoryOption[];
  today: ISODate;
  signal: AbortSignal;
}

/**
 * Audio or text → a draft for review, emitting a plan with the expected duration of each
 * step, the start of each step, the transcript and the tokens as the model writes them.
 * Throws AnalysisError only when there is nothing to show (no audio, whisper down); a failing
 * Ollama still yields a draft, with a warning.
 */
export async function analyzeExpense(
  input: AnalysisInput,
  context: AnalysisContext,
  deps: EngineDeps,
  emit: (event: AiProgressEvent) => void,
): Promise<void> {
  const now = deps.now ?? Date.now;
  const state = engineState();
  const { timings } = state;
  const { options, today, signal } = context;
  const prefix = buildPromptPrefix(options, today);

  const loaded = await deps.extractor.isLoaded(withTimeout(signal, 5000)).catch(() => null);
  const aiReachable = loaded !== null;
  const warming = state.warming?.prefix === prefix ? state.warming : null;
  const warm =
    !warming &&
    loaded === true &&
    state.lastPrefix?.prefix === prefix &&
    now() - state.lastPrefix.at < WARM_WINDOW_MS;
  const coldReadMs = promptTokens(prefix) * timings.coldReadMsPerToken;

  const planFor = (fields: DraftField[], from: AiStagePlan[] = []): AiStagePlan[] => {
    const stages: AiStagePlan[] = [...from];
    if (!aiReachable) return stages;
    const needsLoad = warming ? warming.phase === 'load' : loaded === false;
    if (needsLoad) stages.push({ stage: 'load', estimateMs: timings.loadMs });
    stages.push({ stage: 'read', estimateMs: warm ? timings.warmReadMs : coldReadMs });
    stages.push({ stage: 'write', estimateMs: expectedTokens(fields) * timings.msPerToken });
    return stages;
  };
  const transcribeStage: AiStagePlan[] =
    input.kind === 'audio'
      ? [{ stage: 'transcribe', estimateMs: transcribeEstimate(timings, input.seconds) }]
      : [];
  let plannedFields: DraftField[] = ['description'];
  emit({ type: 'plan', stages: planFor(plannedFields, transcribeStage), msPerToken: timings.msPerToken });

  let text: string;
  if (input.kind === 'audio') {
    emit({ type: 'stage', stage: 'transcribe' });
    const started = now();
    let heard: string;
    try {
      heard = await deps.transcriber.transcribe(
        input.audio,
        input.filename,
        withTimeout(signal, TRANSCRIBE_TIMEOUT_MS),
      );
    } catch (err) {
      if (signal.aborted) throw err;
      console.error('[ia] transcrição falhou:', err instanceof Error ? err.message : err);
      throw new AnalysisError(
        'TRANSCRIBE_FAILED',
        'Não consegui transcrever o áudio agora. Tente de novo em instantes ou escreva o gasto.',
      );
    }
    const ratio = (now() - started) / transcribeStage[0].estimateMs;
    timings.transcribeBaseMs = learnTiming(timings.transcribeBaseMs, timings.transcribeBaseMs * ratio);
    timings.transcribeMsPerAudioSecond = learnTiming(
      timings.transcribeMsPerAudioSecond,
      timings.transcribeMsPerAudioSecond * ratio,
    );
    text = cleanTranscript(heard);
    // whisper writes these for silence
    if (!text || /^[\s.[\]()-]*$|^\[.*\]$|^\(.*\)$/.test(text)) {
      throw new AnalysisError(
        'EMPTY_AUDIO',
        'Não consegui ouvir nada no áudio. Tente de novo, mais perto do microfone.',
      );
    }
    emit({ type: 'transcript', text });
  } else {
    text = cleanTranscript(input.text);
  }

  const reading = readExpenseText(text, options, today);
  const fields = fieldsForModel(reading);
  if (fields.join() !== plannedFields.join()) {
    plannedFields = fields;
    emit({ type: 'plan', stages: planFor(fields, transcribeStage), msPerToken: timings.msPerToken });
  }

  let model: ReturnType<typeof parseModelOutput> | null = null;
  if (aiReachable) {
    const aiSignal = withTimeout(signal, AI_TIMEOUT_MS);
    try {
      let stage: AiStage | null = null;
      const enter = (next: AiStage) => {
        if (stage === next) return;
        stage = next;
        emit({ type: 'stage', stage: next });
      };

      const pending = state.warming?.prefix === prefix ? state.warming : null;
      if (pending) {
        enter(pending.phase);
        if (pending.phase === 'load') {
          // Watch for the switch to reading, so the bar follows the warm-up.
          const tick = setInterval(() => pending.phase === 'read' && enter('read'), 250);
          await pending.promise.finally(() => clearInterval(tick));
        } else {
          await pending.promise;
        }
      } else if (loaded === false) {
        enter('load');
        const started = now();
        await deps.extractor.load(aiSignal);
        timings.loadMs = learnTiming(timings.loadMs, now() - started);
      }

      enter('read');
      const prompt = buildPrompt(prefix, text);
      const expected = expectedTokens(fields);
      const readStarted = now();
      const wasWarm = warm || pending !== null;
      let writeStarted = 0;
      const answer = await deps.extractor.generate(prompt, {
        schema: responseSchema(fields, options),
        maxTokens: expected + 30,
        signal: aiSignal,
        onFirstToken: () => {
          writeStarted = now();
          if (wasWarm) timings.warmReadMs = learnTiming(timings.warmReadMs, writeStarted - readStarted);
          else {
            timings.coldReadMsPerToken = learnTiming(
              timings.coldReadMsPerToken,
              (writeStarted - readStarted) / promptTokens(prompt),
            );
          }
          enter('write');
        },
        onToken: (count) => emit({ type: 'tokens', count, expected }),
      });
      if (writeStarted && answer.tokens > 1) {
        timings.msPerToken = learnTiming(timings.msPerToken, (now() - writeStarted) / (answer.tokens - 1));
      }
      state.lastPrefix = { prefix, at: now() };
      model = parseModelOutput(answer.text, options, today);
    } catch (err) {
      if (signal.aborted) throw err;
      console.error('[ia] extração falhou:', err instanceof Error ? err.message : err);
      model = null;
    }
  }

  emit({ type: 'done', result: buildDraftResult(text, reading, model) });
}
