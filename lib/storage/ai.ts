import type { AiProgressEvent, ExpenseDraftResult } from '../ai/types';
import { ApiRequestError, UNAUTHENTICATED_EVENT } from './apiClient';
import { NotAuthenticatedError } from './repository';

export type ExpenseAnalysisRequest =
  { kind: 'text'; text: string } | { kind: 'audio'; audio: Blob; seconds: number };

/**
 * Sends a recording or a sentence to the server's AI and follows the analysis as it streams
 * (plan, steps, transcript, tokens). Resolves with the draft; nothing is saved.
 */
export async function analyzeExpense(
  request: ExpenseAnalysisRequest,
  onEvent: (event: AiProgressEvent) => void,
  signal?: AbortSignal,
): Promise<ExpenseDraftResult> {
  let response: Response;
  try {
    if (request.kind === 'text') {
      response = await fetch('/api/v1/ai/expense/text', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: request.text }),
        signal,
      });
    } else {
      const form = new FormData();
      const extension = request.audio.type.includes('mp4')
        ? 'm4a'
        : request.audio.type.includes('ogg')
          ? 'ogg'
          : 'webm';
      form.append('audio', request.audio, `gasto.${extension}`);
      form.append('seconds', String(Math.round(request.seconds * 10) / 10));
      response = await fetch('/api/v1/ai/expense/audio', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        body: form,
        signal,
      });
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiRequestError(
      'Sem conexão com o servidor. Verifique a internet e tente de novo.',
      0,
      'NETWORK',
    );
  }

  if (!response.ok || !response.body) {
    if (response.status === 401) {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
      throw new NotAuthenticatedError();
    }
    const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new ApiRequestError(
      payload?.error || 'Não foi possível analisar agora.',
      response.status,
      payload?.code,
    );
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const handle = (block: string): ExpenseDraftResult | undefined => {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const event = JSON.parse(line.slice(5)) as AiProgressEvent;
      if (event.type === 'error') throw new ApiRequestError(event.message, 502, event.code);
      onEvent(event);
      if (event.type === 'done') return event.result;
    }
    return undefined;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const result = handle(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (result) return result;
      }
    }
    const result = handle(buffer);
    if (result) return result;
  } catch (err) {
    if (err instanceof ApiRequestError || signal?.aborted) throw err;
  }
  throw new ApiRequestError('A análise foi interrompida. Tente de novo.', 0, 'INTERRUPTED');
}

/** Asks the server to get the AI ready while the user talks. Failures don't matter. */
export function warmUpExpenseAi(): void {
  void fetch('/api/v1/ai/expense/warmup', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
  }).catch(() => undefined);
}
