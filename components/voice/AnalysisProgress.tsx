'use client';

import { useEffect, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import {
  AI_STAGE_LABELS,
  formatRemaining,
  progressSnapshot,
  type AiStage,
  type ProgressState,
} from '@/lib/ai';

const TEXT_LABELS: Partial<Record<AiStage, string>> = { read: 'Lendo o que você escreveu' };

/**
 * The analysis as it happens on the server: a bar with how much is left and the steps
 * (transcribing, loading the model, reading, writing), each ticked off as the server reports it.
 */
export function AnalysisProgress({
  state,
  kind,
  transcript,
}: {
  /** null until the server sends its plan (the audio is still going up). */
  state: ProgressState | null;
  kind: 'audio' | 'text';
  transcript?: string;
}) {
  const [progress, setProgress] = useState({ fraction: 0.02, remainingMs: 0 });
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!state) return;
      const snapshot = progressSnapshot(state, Date.now());
      // A revised plan can make the estimate jump back; the bar never does.
      setProgress((previous) => ({
        fraction: Math.max(previous.fraction, snapshot.fraction),
        remainingMs: snapshot.remainingMs,
      }));
    }, 200);
    return () => window.clearInterval(timer);
  }, [state]);
  const { fraction } = progress;

  const labelOf = (stage: AiStage) => (kind === 'text' && TEXT_LABELS[stage]) || AI_STAGE_LABELS[stage];
  const currentIndex = state ? state.stages.findIndex((s) => s.stage === state.stage) : -1;
  const heading = !state
    ? kind === 'audio'
      ? 'Enviando o áudio'
      : 'Enviando o texto'
    : currentIndex >= 0
      ? labelOf(state.stages[currentIndex].stage)
      : 'Preparando a análise';

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-foreground text-sm font-semibold">{heading}…</p>
          <p className="text-muted text-sm tabular-nums">{Math.round(fraction * 100)}%</p>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso da análise"
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="bg-border h-2.5 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <p className="text-muted mt-2 text-xs">
          {state && state.stages.length > 0
            ? `${formatRemaining(progress.remainingMs)}, pelo tempo real da IA no servidor`
            : 'A IA roda no próprio servidor do Capital.'}
        </p>
      </div>

      {state && state.stages.length > 0 && (
        <ol className="flex flex-col gap-2">
          {state.stages.map((step, index) => {
            const done = currentIndex > index;
            const current = currentIndex === index;
            return (
              <li
                key={step.stage}
                className={`flex items-center gap-2 text-sm ${current ? 'text-foreground font-medium' : 'text-muted'}`}
              >
                {done ? (
                  <Check className="text-success h-4 w-4" aria-hidden />
                ) : current ? (
                  <LoaderCircle className="text-primary h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <span className="border-border h-4 w-4 rounded-full border" aria-hidden />
                )}
                {labelOf(step.stage)}
              </li>
            );
          })}
        </ol>
      )}

      {transcript && (
        <p className="bg-background text-foreground rounded-lg px-3 py-2 text-sm">
          <span className="text-muted">Você disse: </span>“{transcript}”
        </p>
      )}
    </div>
  );
}
