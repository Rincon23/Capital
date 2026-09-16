import type { CategoryKind } from '../budget/types';

/** ISO date (YYYY-MM-DD). */
export type ISODate = string;

/** One category the user can log an expense in, as the voice/text entry sees it. */
export interface CategoryOption {
  categoryKind: CategoryKind;
  /** Set when categoryKind is 'topic'. */
  topicId?: string;
  /** The user's own name for it ("Diversos", "Custo Fixo", "A receber"). */
  label: string;
}

/**
 * What the voice/text entry understood. It is only a draft: the app shows it for review and
 * nothing is saved until the user confirms. Missing fields stay empty instead of guessed.
 */
export interface ExpenseDraft {
  categoryKind?: CategoryKind;
  topicId?: string;
  description: string;
  /** Always positive when present. */
  amount?: number;
  date: ISODate;
  /** On the credit card. Debit, pix and cash are false. */
  card: boolean;
}

export type DraftField = 'category' | 'description' | 'amount' | 'date' | 'card';

export interface ExpenseDraftResult {
  draft: ExpenseDraft;
  /** What was heard (voice) or typed (text). */
  transcript: string;
  /** Things the user should check before saving, in pt-BR. */
  warnings: string[];
  /** Fields that came from the AI rather than from the rules, for display. */
  aiFields: DraftField[];
}

/**
 * The steps of an analysis on the Orange Pi, in order. `transcribe` only happens for audio;
 * `load` only when the model has to be loaded into memory first.
 */
export type AiStage = 'transcribe' | 'load' | 'read' | 'write';

export interface AiStagePlan {
  stage: AiStage;
  /** How long this step is expected to take, from the Pi's recent timings. */
  estimateMs: number;
}

/** What the server streams while it works, so the app can show how much is left. */
export type AiProgressEvent =
  | { type: 'plan'; stages: AiStagePlan[]; msPerToken: number }
  | { type: 'stage'; stage: AiStage }
  | { type: 'transcript'; text: string }
  | { type: 'tokens'; count: number; expected: number }
  | { type: 'done'; result: ExpenseDraftResult }
  | { type: 'error'; code: string; message: string };
