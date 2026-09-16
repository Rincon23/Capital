import 'server-only';
import { isModuleOn } from '@/lib/budget';
import { categoryOptions, type AiProgressEvent, type CategoryOption } from '@/lib/ai';
import { zonedToday } from '@/lib/reminders/time';
import type { PostgresBudgetRepository } from '../budgetRepository';
import { HttpError } from '../httpError';
import { isOwnerEmail } from '../owner';
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
 * The AI runs on the owner's hardware (decision D3): only the owner, with the module on,
 * and within a rate limit. Checked on every request, whatever the browser shows.
 */
export async function requireVoiceAccess(
  repo: PostgresBudgetRepository,
  email: string | null,
  { countAttempt }: { countAttempt: boolean },
): Promise<VoiceAccess> {
  if (!isOwnerEmail(email)) {
    throw new HttpError(403, 'NOT_OWNER', 'Lançar por voz ou texto é exclusivo do dono deste app.');
  }
  const settings = await repo.getSettings();
  if (!isModuleOn(settings, 'voice')) {
    throw new HttpError(403, 'MODULE_OFF', 'Ligue "Lançar por voz ou texto" em Configurações → Módulos.');
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
  run: (emit: (event: AiProgressEvent) => void, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AiProgressEvent) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // the app went away
        }
      };
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
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
    cancel() {
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
