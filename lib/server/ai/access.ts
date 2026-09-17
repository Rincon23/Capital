import 'server-only';
import { isModuleOn } from '@/lib/modules';
import { categoryOptions, type AiProgressEvent, type CategoryOption } from '@/lib/ai';
import { zonedToday } from '@/lib/reminders/time';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';
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
 * Any user with the module on, within a per-user rate limit (the AI is shared by everyone on
 * this server). Checked on every request, whatever the browser shows.
 */
export async function requireVoiceAccess(
  repo: PostgresBudgetRepository,
  email: string | null,
  { countAttempt }: { countAttempt: boolean },
): Promise<VoiceAccess> {
  const settings = await repo.getSettings();
  if (!isModuleOn(settings, 'voice')) {
    throw new HttpError(403, 'MODULE_OFF', 'Ligue "Lançar por voz ou texto" em Mais → Módulos.');
  }
  const config = aiConfig();
  if (!config) {
    throw new HttpError(503, 'AI_NOT_CONFIGURED', 'A IA não está configurada neste servidor.');
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
 * A text/event-stream response fed by `run`. Each event is one `data:` line of JSON. The
 * stream stops (and the work is aborted) when the app goes away.
 */
export function progressStream(
  request: Request,
  label: string,
  run: (emit: (event: AiProgressEvent) => void, signal: AbortSignal) => Promise<void>,
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
