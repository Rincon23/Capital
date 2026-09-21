import 'server-only';
import { isModuleOn } from '@/lib/modules';
import { categoryOptions, type AiProgressEvent, type CategoryOption } from '@/lib/ai';
import { zonedToday } from '@/lib/reminders/time';
import type { UserAccess } from '../access';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';
import { isUnderStrain } from '../loadGuard';
import { allowAttempt } from '../rateLimit';
import { AnalysisError } from './engine';
import { aiConfig, OllamaExtractor, WhisperTranscriber, type AiConfig } from './providers';

export interface VoiceAccess {
  config: AiConfig;
  options: CategoryOption[];
  today: string;
  transcriber: WhisperTranscriber;
  extractor: OllamaExtractor;
}

/**
 * VIP accounts with the module on (it is VIP-only: the AI heats the board),
 * within a per-user rate limit, and only while the server is not under strain. Checked on every
 * request, whatever the browser shows.
 */
export async function requireVoiceAccess(
  repo: PostgresBudgetRepository,
  email: string | null,
  access: UserAccess,
  { countAttempt }: { countAttempt: boolean },
): Promise<VoiceAccess> {
  if (!access.vip) {
    throw new HttpError(403, 'VIP_ONLY', 'Lançar por voz ou texto é só para contas VIP.');
  }
  const settings = await repo.getSettings();
  if (!isModuleOn(settings, 'voice')) {
    throw new HttpError(403, 'MODULE_OFF', 'Ligue "Lançar por voz ou texto" em Mais → Módulos.');
  }
  const config = aiConfig();
  if (!config) {
    throw new HttpError(503, 'AI_NOT_CONFIGURED', 'A IA não está configurada neste servidor.');
  }
  if (isUnderStrain()) {
    throw new HttpError(
      503,
      'SERVER_HOT',
      'O servidor está descansando para não esquentar. Tente de novo em alguns minutos ou lance pelo formulário.',
    );
  }
  if (countAttempt && !allowAttempt(`ai-expense:${email}`, 40, 60 * 60_000)) {
    throw new HttpError(
      429,
      'RATE_LIMITED',
      'Muitas análises seguidas. Espere alguns minutos e tente de novo.',
    );
  }
  return {
    config,
    options: categoryOptions(settings),
    today: zonedToday(),
    transcriber: new WhisperTranscriber(config.whisperUrl),
    extractor: new OllamaExtractor(config.ollamaUrl, config.ollamaModel),
  };
}

/**
 * The analyses running right now, on the whole server. Whisper and the model take every core of
 * the board for seconds at a time: one at a time keeps it from overheating, and anyone else gets
 * a clear "try again in a moment" instead of a queue that slows everybody down.
 */
const MAX_CONCURRENT_ANALYSES = 1;
const globalForAi = globalThis as unknown as { __capitalAiRunning?: number };

/** Takes a slot for one analysis, or refuses with 503; the returned function gives it back. */
export function acquireAnalysisSlot(): () => void {
  const running = globalForAi.__capitalAiRunning ?? 0;
  if (running >= MAX_CONCURRENT_ANALYSES) {
    throw new HttpError(
      503,
      'AI_BUSY',
      'A IA está atendendo outro lançamento agora. Tente de novo em alguns segundos.',
    );
  }
  globalForAi.__capitalAiRunning = running + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    globalForAi.__capitalAiRunning = Math.max(0, (globalForAi.__capitalAiRunning ?? 1) - 1);
  };
}

/**
 * A text/event-stream response fed by `run`. Each event is one `data:` line of JSON. The
 * stream stops (and the work is aborted) when the app goes away.
 */
export function progressStream(
  request: Request,
  label: string,
  run: (emit: (event: AiProgressEvent) => void, signal: AbortSignal) => Promise<void>,
  /** Called once the analysis is over, whatever happened (gives the analysis slot back). */
  onFinish?: () => void,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
  // What was sent, for the log line at the end ("plan stage:transcribe transcript … done").
  const sent: string[] = [];
  let tokens = 0;
  const summary = () => [...sent, ...(tokens ? [`tokens×${tokens}`] : [])].join(' ');
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  request.signal.addEventListener(
    'abort',
    () => {
      if (!abort.signal.aborted)
        console.warn(`[ia] ${label}: o app desconectou após ${elapsed()} (${summary()})`);
      abort.abort();
    },
    { once: true },
  );

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch (err) {
          console.warn(
            `[ia] ${label}: não consegui enviar após ${elapsed()}:`,
            err instanceof Error ? err.message : err,
          );
        }
      };
      const emit = (event: AiProgressEvent) => {
        if (event.type === 'tokens') tokens = event.count;
        else sent.push(event.type === 'stage' ? `stage:${event.stage}` : event.type);
        write(`data: ${JSON.stringify(event)}\n\n`);
      };
      // A comment every few seconds, so no proxy or mobile network drops a quiet connection
      // while whisper or the model works. The app ignores lines that aren't `data:`.
      heartbeat = setInterval(() => write(': ping\n\n'), 3000);

      run(emit, abort.signal)
        .catch((err: unknown) => {
          if (abort.signal.aborted) return;
          if (err instanceof AnalysisError) emit({ type: 'error', code: err.code, message: err.message });
          else {
            console.error('[ia]', err);
            emit({
              type: 'error',
              code: 'INTERNAL',
              message: 'Erro no servidor. Tente novamente em instantes.',
            });
          }
        })
        .finally(() => {
          onFinish?.();
          clearInterval(heartbeat);
          console.log(`[ia] ${label}: terminou em ${elapsed()} (${summary()})`);
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
    cancel(reason) {
      clearInterval(heartbeat);
      console.warn(`[ia] ${label}: o app fechou a resposta após ${elapsed()} (${summary()})`, reason ?? '');
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform keeps the compression layer from holding the events back
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
