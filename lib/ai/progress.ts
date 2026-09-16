import type { AiStage, AiStagePlan } from './types';

/**
 * How long each step takes on the Orange Pi. The defaults were measured on it (September
 * 2026: whisper `base`, qwen2.5:1.5b); the server then learns from every real run, so the
 * progress bar follows the Pi's actual speed.
 */
export interface AiTimings {
  /** Whisper: fixed part (conversion, start-up) … */
  transcribeBaseMs: number;
  /** … plus this much per second of audio. */
  transcribeMsPerAudioSecond: number;
  /** Loading the model into memory when Ollama had unloaded it. */
  loadMs: number;
  /** Reading the prompt from scratch, per prompt token. */
  coldReadMsPerToken: number;
  /** Reading only the new text when the prompt's start is still cached. */
  warmReadMs: number;
  /** Writing the answer, per token. */
  msPerToken: number;
}

export const DEFAULT_AI_TIMINGS: AiTimings = {
  transcribeBaseMs: 2800,
  transcribeMsPerAudioSecond: 210,
  loadMs: 8000,
  coldReadMsPerToken: 23,
  warmReadMs: 900,
  msPerToken: 330,
};

/** Moves a timing towards what was just observed (an exponential moving average). */
export function learnTiming(current: number, observed: number, weight = 0.3): number {
  if (!Number.isFinite(observed) || observed <= 0) return current;
  return Math.round(current * (1 - weight) + observed * weight);
}

/** Portuguese prompts run at about 3.5 characters per token on qwen2.5. */
export function promptTokens(prompt: string): number {
  return Math.ceil(prompt.length / 3.5);
}

export function transcribeEstimate(timings: AiTimings, audioSeconds: number): number {
  return timings.transcribeBaseMs + timings.transcribeMsPerAudioSecond * Math.max(0, audioSeconds);
}

export const AI_STAGE_LABELS: Record<AiStage, string> = {
  transcribe: 'Transcrevendo o áudio',
  load: 'Carregando a IA na memória',
  read: 'Lendo o que você disse',
  write: 'Montando o gasto',
};

export interface ProgressState {
  stages: AiStagePlan[];
  msPerToken: number;
  /** The step running now; undefined before the first one starts. */
  stage?: AiStage;
  /** When the current step started, on the client's clock. */
  stageStartedAt: number;
  tokens?: { count: number; expected: number };
}

export interface ProgressSnapshot {
  /** 0..1 */
  fraction: number;
  remainingMs: number;
}

/**
 * Where the analysis is. Steps with a real signal use it (tokens written so far); the others
 * advance with their estimate and slow down near the end instead of stopping or passing 100%
 * when the Pi is slower than usual.
 */
export function progressSnapshot(state: ProgressState, now: number): ProgressSnapshot {
  const total = state.stages.reduce((sum, stage) => sum + stage.estimateMs, 0);
  if (total <= 0) return { fraction: 0, remainingMs: 0 };
  const index = state.stages.findIndex((stage) => stage.stage === state.stage);
  if (index === -1) return { fraction: 0, remainingMs: total };

  const done = state.stages.slice(0, index).reduce((sum, stage) => sum + stage.estimateMs, 0);
  const current = state.stages[index];
  const later = state.stages.slice(index + 1).reduce((sum, stage) => sum + stage.estimateMs, 0);
  const elapsed = Math.max(0, now - state.stageStartedAt);

  let part: number;
  let currentLeft: number;
  if (current.stage === 'write' && state.tokens && state.tokens.expected > 0) {
    part = Math.min(state.tokens.count / state.tokens.expected, 0.97);
    currentLeft = Math.max(state.tokens.expected - state.tokens.count, 1) * state.msPerToken;
  } else {
    part = 1 - Math.exp((-1.6 * elapsed) / Math.max(current.estimateMs, 1));
    currentLeft = Math.max(current.estimateMs - elapsed, 1000);
  }

  return {
    fraction: Math.min((done + part * current.estimateMs) / total, 0.99),
    remainingMs: currentLeft + later,
  };
}

/** "Faltam cerca de 12 s", "Falta menos de 5 s", "Falta cerca de 1 min". */
export function formatRemaining(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds <= 5) return 'Falta menos de 5 s';
  if (seconds < 60) return `Faltam cerca de ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes === 1 ? 'Falta' : 'Faltam'} cerca de ${minutes} min`;
}
