'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, RotateCcw, Square } from 'lucide-react';
import {
  specialCategoryLabel,
  type BudgetSettings,
  type Expense,
  type ExpenseSource,
  type Month,
} from '@/lib/budget';
import type { ExpenseDraftResult, ProgressState } from '@/lib/ai';
import { isModuleOn } from '@/lib/modules';
import { analyzeExpense, warmUpExpenseAi, type ExpenseAnalysisRequest } from '@/lib/storage/ai';
import { ModuleHelpButton } from '@/components/modules/ModuleHelpButton';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { AnalysisProgress } from './AnalysisProgress';
import { DraftReview } from './DraftReview';
import { useAudioRecorder, type Recording } from './useAudioRecorder';

const MAX_SECONDS = 60;

type Kind = 'audio' | 'text';
type Phase =
  | { name: 'input' }
  | { name: 'analyzing'; kind: Kind }
  | { name: 'review'; kind: Kind; result: ExpenseDraftResult }
  | { name: 'error'; kind: Kind; message: string };

/**
 * The draft as an expense, for saving or for opening the form. Without the card module, what the
 * AI understood about the card is left out.
 */
export function draftToExpense(
  result: ExpenseDraftResult,
  kind: Kind,
  specialCategories: BudgetSettings['specialCategories'],
  cardEnabled: boolean,
): Partial<Expense> {
  const { draft } = result;
  const source: ExpenseSource = kind === 'audio' ? 'voice' : 'text';
  return {
    categoryKind: draft.categoryKind,
    topicId: draft.topicId,
    description:
      draft.description ||
      (draft.categoryKind ? specialCategoryLabel(draft.categoryKind, specialCategories) : ''),
    amount: draft.amount,
    date: draft.date,
    singleInstallmentCard: cardEnabled && draft.card,
    source,
  };
}

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * "Lançar por voz ou texto": record (up to 60 s) or type the expense, follow the analysis
 * on the server, then check the draft. Saving is one tap; the pencil opens the full form.
 */
export function VoiceEntrySheet({
  month,
  settings,
  onClose,
  onSave,
  onEdit,
}: {
  month: Month;
  settings: Pick<BudgetSettings, 'topics' | 'specialCategories' | 'specialCategoryColors' | 'modules'>;
  onClose: () => void;
  onSave: (expense: Expense) => Promise<void>;
  /** Opens the expense form filled with the draft. */
  onEdit: (draft: Partial<Expense>) => void;
}) {
  const { showToast } = useToast();
  const [phase, setPhase] = useState<Phase>({ name: 'input' });
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [transcript, setTranscript] = useState<string>();
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Get the model into memory while the user is still talking.
  useEffect(() => {
    warmUpExpenseAi();
    return () => abortRef.current?.abort();
  }, []);

  const analyze = useCallback(async (request: ExpenseAnalysisRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(null);
    setTranscript(undefined);
    setPhase({ name: 'analyzing', kind: request.kind });
    try {
      const result = await analyzeExpense(
        request,
        (event) => {
          if (event.type === 'plan') {
            setProgress((previous) => ({
              stages: event.stages,
              msPerToken: event.msPerToken,
              stage: previous?.stage,
              stageStartedAt: previous?.stageStartedAt ?? Date.now(),
              tokens: previous?.tokens,
            }));
          } else if (event.type === 'stage') {
            setProgress((previous) =>
              previous
                ? { ...previous, stage: event.stage, stageStartedAt: Date.now(), tokens: undefined }
                : previous,
            );
          } else if (event.type === 'tokens') {
            setProgress((previous) =>
              previous ? { ...previous, tokens: { count: event.count, expected: event.expected } } : previous,
            );
          } else if (event.type === 'transcript') {
            setTranscript(event.text);
          }
        },
        controller.signal,
      );
      setPhase({ name: 'review', kind: request.kind, result });
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase({
        name: 'error',
        kind: request.kind,
        message: err instanceof Error ? err.message : 'Não foi possível analisar agora.',
      });
    }
  }, []);

  const recorder = useAudioRecorder({
    maxSeconds: MAX_SECONDS,
    onFinish: (recording: Recording) => void analyze({ kind: 'audio', ...recording }),
  });

  function backToInput() {
    abortRef.current?.abort();
    setPhase({ name: 'input' });
  }

  async function handleSave(result: ExpenseDraftResult, kind: Kind) {
    const partial = draftToExpense(result, kind, settings.specialCategories, isModuleOn(settings, 'card'));
    if (!partial.categoryKind || partial.amount === undefined) return;
    setSaving(true);
    try {
      await onSave({ ...partial, id: crypto.randomUUID() } as Expense);
      showToast('Gasto registrado! Seu controle financeiro já foi atualizado.');
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error && err.message ? err.message : 'Não foi possível salvar. Tente novamente.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }

  const firstTopic = [...settings.topics].filter((t) => !t.archived).sort((a, b) => a.order - b.order)[0];
  const example = `Gastei 32 reais no almoço no cartão, categoria ${(firstTopic?.name ?? 'diversos').toLocaleLowerCase('pt-BR')}`;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={phase.name === 'review' ? 'Confira o gasto' : 'Lançar por voz ou texto'}
      headerAction={<ModuleHelpButton module="voice" onBeforeTour={onClose} />}
    >
      {phase.name === 'input' && !recorder.recording && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 pt-1 text-center">
            <button
              type="button"
              onClick={() => void recorder.start()}
              data-tour="voz-gravar"
              aria-label="Gravar o gasto"
              className="bg-primary text-primary-foreground flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
            >
              <Mic className="h-9 w-9" aria-hidden />
            </button>
            <div>
              <p className="text-foreground text-sm font-semibold">Toque e fale o gasto</p>
              <p className="text-muted mt-1 text-sm">
                Diga a categoria, o que foi e o valor. Se não foi hoje ou foi no cartão, diga também.
              </p>
              <p className="text-muted mt-1 text-sm italic">“{example}”</p>
            </div>
            {recorder.error && (
              <p className="bg-danger-bg text-danger w-full rounded-lg px-3 py-2 text-left text-sm">
                {recorder.error}
              </p>
            )}
          </div>

          <div className="text-muted flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            ou escreva
            <span className="bg-border h-px flex-1" />
          </div>

          <form
            className="flex flex-col gap-3"
            data-tour="voz-escrever"
            onSubmit={(event) => {
              event.preventDefault();
              if (text.trim()) void analyze({ kind: 'text', text: text.trim() });
            }}
          >
            <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
              Descreva o gasto
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder={`Ex.: 25 reais de gasolina ontem, ${(firstTopic?.name ?? 'diversos').toLocaleLowerCase('pt-BR')}`}
                className="border-border bg-background text-foreground focus:ring-primary rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
              />
            </label>
            <button
              type="submit"
              disabled={!text.trim()}
              className="border-border text-foreground min-h-[44px] rounded-lg border px-4 font-semibold disabled:opacity-50"
            >
              Analisar
            </button>
          </form>
        </div>
      )}

      {recorder.recording && (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3" aria-hidden>
              <span className="bg-danger absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
              <span className="bg-danger relative inline-flex h-3 w-3 rounded-full" />
            </span>
            <p className="text-foreground text-sm font-semibold">Gravando…</p>
          </div>
          <p className="text-foreground text-4xl font-semibold tabular-nums">
            {clock(recorder.elapsedMs)}
            <span className="text-muted text-base font-normal"> / {clock(MAX_SECONDS * 1000)}</span>
          </p>
          <div className="bg-border h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-danger h-full rounded-full transition-[width] duration-200"
              style={{ width: `${Math.min(recorder.elapsedMs / (MAX_SECONDS * 10), 100)}%` }}
            />
          </div>
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={recorder.cancel}
              className="border-border text-foreground min-h-[48px] rounded-lg border px-4 font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={recorder.stop}
              className="bg-primary text-primary-foreground flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg px-4 font-semibold"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden />
              Pronto
            </button>
          </div>
        </div>
      )}

      {phase.name === 'analyzing' && (
        <div className="flex flex-col gap-5">
          <AnalysisProgress state={progress} kind={phase.kind} transcript={transcript} />
          <button
            type="button"
            onClick={backToInput}
            className="border-border text-foreground min-h-[44px] rounded-lg border px-4 font-medium"
          >
            Cancelar
          </button>
        </div>
      )}

      {phase.name === 'error' && (
        <div className="flex flex-col gap-4">
          <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm">{phase.message}</p>
          <button
            type="button"
            onClick={backToInput}
            className="bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 font-semibold"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Tentar de novo
          </button>
        </div>
      )}

      {phase.name === 'review' && (
        <div className="flex flex-col gap-5">
          <DraftReview
            result={phase.result}
            month={month}
            settings={settings}
            kind={phase.kind}
            cardEnabled={isModuleOn(settings, 'card')}
            onEdit={() =>
              onEdit(
                draftToExpense(
                  phase.result,
                  phase.kind,
                  settings.specialCategories,
                  isModuleOn(settings, 'card'),
                ),
              )
            }
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={backToInput}
              disabled={saving}
              className="border-border text-foreground flex min-h-[48px] items-center gap-2 rounded-lg border px-4 font-medium disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              De novo
            </button>
            <button
              type="button"
              onClick={() => void handleSave(phase.result, phase.kind)}
              disabled={saving || !phase.result.draft.categoryKind || phase.result.draft.amount === undefined}
              className="bg-primary text-primary-foreground min-h-[48px] flex-1 rounded-lg px-4 font-semibold disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar gasto'}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
