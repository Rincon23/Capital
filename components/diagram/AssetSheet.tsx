'use client';

import { useMemo, useState } from 'react';
import { formatBRL, parseAmountInput, todayISO } from '@/lib/budget';
import {
  activeQuestions,
  assetScore,
  assetType,
  formatScore,
  questionsOf,
  RECOMMENDED_QUESTIONS,
  SCORE_SCALE,
  grahamAnswer,
  type Answer,
  type AssetAnswers,
  type AssetIndicators,
  type DiagramQuestion,
  type DiagramAsset,
  type DiagramOverview,
  type TickerType,
} from '@/lib/diagram';
import { diagramRepository } from '@/lib/storage';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatWhen, pct, quotasLabel } from './format';

/** A quantity as the field shows it: no thousands dots, comma for decimals ("1234,5"). */
export function quantityText(quantity: number): string {
  return quantity === 0 ? '' : String(quantity).replace('.', ',');
}

/** An optional text: empty is "Não informado", and "Não informar" clears it. */
export function OptionalText({
  label,
  value,
  onChange,
  multiline,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength: number;
}) {
  const className =
    'border-border bg-background text-foreground focus:ring-primary w-full rounded-lg border px-3 py-2 text-base outline-none focus:ring-2';
  return (
    <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
      <span className="flex items-center justify-between gap-2">
        {label}
        {value.trim() !== '' && (
          <button type="button" onClick={() => onChange('')} className="text-primary text-xs font-semibold">
            Não informar
          </button>
        )}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Não informado"
          maxLength={maxLength}
          rows={2}
          className={className}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Não informado"
          maxLength={maxLength}
          className={`${className} min-h-[44px]`}
        />
      )}
    </label>
  );
}

/** The direct score, −10 … 10 on screen (kept from −1 to 1), with a slider and the number. */
export function DirectScoreField({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-muted text-sm font-medium">Nota (de −10 a 10)</span>
        <span className="text-foreground text-sm font-semibold tabular-nums">{formatScore(value)}</span>
      </div>
      <input
        type="range"
        min={-SCORE_SCALE}
        max={SCORE_SCALE}
        step={0.5}
        value={(value ?? 0) * SCORE_SCALE}
        onChange={(event) => onChange(Number(event.target.value) / SCORE_SCALE)}
        aria-label="Nota do ativo"
        className="accent-primary w-full"
      />
      <span className="text-muted flex justify-between text-[11px]">
        <span>−10 não compraria</span>
        <span>0</span>
        <span>10 compraria muito</span>
      </span>
    </div>
  );
}

/**
 * A question the app answers by itself (VIP): the answer, and the numbers it came from — Graham's
 * fair price against today's price, or the P/VP. For an account that is not VIP it is marked VIP
 * and left out of the score.
 */
function AutoQuestionRow({
  question,
  vip,
  answer,
  indicators,
  price,
}: {
  question: DiagramQuestion;
  vip: boolean;
  answer: Answer | null;
  indicators: AssetIndicators | undefined;
  price: number | null;
}) {
  let detail: string;
  if (!vip) detail = 'Só para contas VIP: não entra na nota.';
  else if (!indicators) detail = 'Ainda sem os dados do Fundamentus para este ativo.';
  else if (question.auto === 'pvp') {
    detail = indicators.pvp === null ? 'O Fundamentus não informou o P/VP.' : `P/VP de hoje: ${indicators.pvp.toLocaleString('pt-BR')}.`;
  } else {
    const graham = grahamAnswer(price, indicators.lpa, indicators.vpa);
    if (!graham) detail = 'Sem preço ou sem LPA/VPA para calcular.';
    else if (graham.verdict === 'negative') detail = 'Lucro ou patrimônio negativo: não há preço justo.';
    else {
      const above = (graham.ratio ?? 1) - 1;
      detail = `Preço justo ${formatBRL(graham.fairValue ?? 0)}; preço ${formatBRL(price ?? 0)} (${above >= 0 ? '+' : '−'}${pct(Math.abs(above))}), P/L ${(graham.pl ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}. ${
        graham.verdict === 'fair'
          ? 'Perto ou abaixo do justo.'
          : graham.verdict === 'expensive'
            ? 'Caro pelo Graham.'
            : 'Graham não se aplica (P/L de 15 ou mais, ou mais do dobro do justo).'
      }`;
    }
  }
  return (
    <li className={`flex flex-col gap-2 ${vip ? '' : 'opacity-60'}`}>
      <div>
        <p className="text-muted flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
          {question.criterion}
          <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] tracking-normal normal-case">
            {vip ? 'Automática' : 'VIP'}
          </span>
        </p>
        <p className="text-foreground text-sm">{question.text}</p>
        <p className="text-muted mt-0.5 text-xs">{detail}</p>
        {vip && indicators && (
          <p className="text-muted text-[11px]">Fundamentus, {formatWhen(indicators.fetchedAt)}</p>
        )}
      </div>
      {vip && (
        <p
          className={`self-start rounded-lg border px-3 py-1.5 text-sm font-medium ${
            answer === 1
              ? 'border-success bg-success-bg text-success'
              : answer === -1
                ? 'border-danger bg-danger-bg text-danger'
                : 'border-border text-muted'
          }`}
        >
          {answer === 1 ? 'Sim' : answer === -1 ? 'Não' : 'Sem dados'}
        </p>
      )}
    </li>
  );
}

const ANSWERS: { value: Answer | null; label: string }[] = [
  { value: 1, label: 'Sim' },
  { value: -1, label: 'Não' },
  { value: null, label: 'Sem resposta' },
];

/**
 * One asset: its questions answered with Sim / Não / sem resposta and, on top, the points for and
 * against and the final score changing as the person taps. An ETF (or an asset of a type with no
 * questions yet) takes a score typed directly. "Não compro mais" keeps the answers: unmarking gives
 * the score back.
 */
export function AssetSheet({
  overview,
  asset,
  onClose,
  onChanged,
  onOpenQuestions,
}: {
  overview: DiagramOverview;
  asset: DiagramAsset;
  onClose: () => void;
  /** Reloads the overview after a write. */
  onChanged: () => Promise<unknown>;
  /** "Criar perguntas": the questions of this asset's type. */
  onOpenQuestions: (type: TickerType) => void;
}) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const type = assetType(asset.type);
  const questions = questionsOf(overview.questions, asset.type);
  // An automatic question (Graham, P/VP) only counts for VIP accounts.
  const counted = questions.filter((question) => !question.auto || overview.vip);
  const savedAnswers = useMemo(() => overview.answers[asset.id] ?? {}, [overview.answers, asset.id]);
  const quote = overview.quotes[asset.id];

  const [quantity, setQuantity] = useState(quantityText(asset.quantity));
  const [stopBuying, setStopBuying] = useState(asset.stopBuying);
  const [isEtf, setIsEtf] = useState(asset.isEtf);
  const [directScore, setDirectScore] = useState<number | null>(asset.directScore);
  const [answers, setAnswers] = useState<AssetAnswers>(savedAnswers);
  const [sector, setSector] = useState(asset.sector ?? '');
  const [subsector, setSubsector] = useState(asset.subsector ?? '');
  const [note, setNote] = useState(asset.note ?? '');
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  const parsedQuantity = Math.max(0, parseAmountInput(quantity));
  const score = assetScore({ isEtf, directScore }, counted, answers);
  const noQuestions = activeQuestions(counted).length === 0;
  const recommended = RECOMMENDED_QUESTIONS[asset.type].length > 0;

  function answer(questionId: string, value: Answer | null) {
    setAnswers((current) => {
      const next = { ...current };
      if (value === null) delete next[questionId];
      else next[questionId] = value;
      return next;
    });
  }

  async function handleRecommended() {
    setCopying(true);
    try {
      const { added } = await diagramRepository.useRecommended(asset.type);
      await onChanged();
      showToast(added > 0 ? `${added} perguntas recomendadas entraram em ${type.label}.` : 'As recomendadas já estão lá.');
    } catch {
      showToast('Não foi possível copiar as perguntas.', 'error');
    } finally {
      setCopying(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Remover ${asset.ticker}?`,
      message: `${asset.ticker} sai do Diagrama, com as respostas das perguntas dele. Os aportes que você já registrou continuam no histórico.`,
      confirmLabel: 'Remover',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!ok) return;
    try {
      await diagramRepository.deleteAsset(asset.id);
      await onChanged();
      showToast(`${asset.ticker} removido.`);
      onClose();
    } catch {
      showToast('Não foi possível remover. Tente de novo em instantes.', 'error');
    }
  }

  return (
    <BottomSheet open title={asset.ticker} onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            const today = todayISO();
            await diagramRepository.updateAsset(
              asset.id,
              {
                type: asset.type,
                ticker: asset.ticker,
                quantity: parsedQuantity,
                sector,
                subsector,
                note,
                stopBuying,
                isEtf,
                directScore,
              },
              today,
            );
            const changed = questions.filter(
              (question) => !question.auto && (answers[question.id] ?? null) !== (savedAnswers[question.id] ?? null),
            );
            for (const question of changed) {
              await diagramRepository.setAnswer(asset.id, question.id, answers[question.id] ?? null);
            }
            await onChanged();
            showToast('Ativo salvo.');
            onClose();
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Não foi possível salvar.', 'error');
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex flex-col gap-0.5">
          <p className="text-muted flex items-center gap-1.5 text-xs">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: type.color }} />
            {type.label}
            {quote?.name ? ` · ${quote.name}` : ''}
          </p>
          <p className="text-foreground text-sm">
            {quote
              ? `${formatBRL(quote.price)} por cota · ${quotasLabel(asset.quantity, asset.type)} = ${formatBRL(asset.quantity * quote.price)}`
              : 'Sem cotação ainda: ele não entra no aporte até ter uma.'}
          </p>
        </div>

        <section className="bg-background grid grid-cols-3 gap-2 rounded-xl p-3 text-center" aria-live="polite">
          {score.source === 'questions' ? (
            <>
              <div>
                <p className="text-muted text-[11px]">Pontos positivos</p>
                <p className="text-success text-lg font-semibold tabular-nums">+{score.positive.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-muted text-[11px]">Pontos negativos</p>
                <p className="text-danger text-lg font-semibold tabular-nums">−{score.negative.toLocaleString('pt-BR')}</p>
              </div>
            </>
          ) : (
            <div className="col-span-2 flex items-center justify-center">
              <p className="text-muted text-xs">{isEtf ? 'ETF: nota direta, sem perguntas.' : 'Nota direta, enquanto o tipo não tem perguntas.'}</p>
            </div>
          )}
          <div>
            <p className="text-muted text-[11px]">Nota final</p>
            <p className="text-foreground text-lg font-semibold tabular-nums">{formatScore(score.score)}</p>
          </div>
        </section>

        {stopBuying ? (
          <p className="bg-warning-bg text-warning rounded-lg px-3 py-2 text-xs">
            Não compro mais: a nota fica guardada, mas ele nunca recebe aporte. O valor dele continua contando na
            meta de {type.label}.
          </p>
        ) : score.score === null ? (
          <p className="bg-background text-muted rounded-lg px-3 py-2 text-xs">Sem nota ainda: ele não recebe aporte.</p>
        ) : score.score <= 0 ? (
          <p className="bg-background text-muted rounded-lg px-3 py-2 text-xs">Nota 0 ou menor: ele não recebe aporte.</p>
        ) : null}

        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-foreground text-sm font-medium">Não compro mais</span>
            <span className="text-muted text-xs">Continua na carteira, mas nunca é sugerido.</span>
          </span>
          <input
            type="checkbox"
            checked={stopBuying}
            onChange={(event) => setStopBuying(event.target.checked)}
            className="accent-primary h-5 w-5 shrink-0"
          />
        </label>

        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-foreground text-sm font-medium">É um ETF</span>
            <span className="text-muted text-xs">ETF não responde perguntas: recebe uma nota direta.</span>
          </span>
          <Switch checked={isEtf} onChange={setIsEtf} label="É um ETF" />
        </div>

        {(isEtf || noQuestions) && (
          <DirectScoreField value={directScore} onChange={(value) => setDirectScore(Math.round(value * 100) / 100)} />
        )}

        {!isEtf && noQuestions && (
          <div className="border-border flex flex-col gap-2 rounded-xl border border-dashed p-3">
            <p className="text-foreground text-sm">{type.label} ainda não tem perguntas.</p>
            <p className="text-muted text-xs">Enquanto isso, use a nota direta acima.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenQuestions(asset.type)}
                className="border-border text-foreground min-h-[40px] rounded-lg border px-3 text-sm font-medium"
              >
                Criar perguntas
              </button>
              {recommended && (
                <button
                  type="button"
                  onClick={() => void handleRecommended()}
                  disabled={copying}
                  className="bg-primary text-primary-foreground min-h-[40px] rounded-lg px-3 text-sm font-semibold disabled:opacity-50"
                >
                  {copying ? 'Copiando…' : 'Usar as recomendadas'}
                </button>
              )}
            </div>
          </div>
        )}

        {!isEtf && !noQuestions && (
          <section className="flex flex-col gap-3">
            <h3 className="text-muted text-sm font-semibold">Perguntas de {type.label}</h3>
            <ul className="flex flex-col gap-3">
              {questions.map((question) => {
                if (question.auto) {
                  return (
                    <AutoQuestionRow
                      key={question.id}
                      question={question}
                      vip={overview.vip}
                      answer={answers[question.id] ?? null}
                      indicators={overview.indicators[asset.id]}
                      price={quote?.price ?? null}
                    />
                  );
                }
                const off = question.weight <= 0;
                const current = answers[question.id] ?? null;
                return (
                  <li key={question.id} className={`flex flex-col gap-2 ${off ? 'opacity-50' : ''}`}>
                    <div>
                      <p className="text-muted text-[11px] font-semibold tracking-wide uppercase">
                        {question.criterion}
                        {off ? ' · desligada (peso 0)' : question.weight !== 1 ? ` · peso ${question.weight.toLocaleString('pt-BR')}` : ''}
                      </p>
                      <p className="text-foreground text-sm">{question.text}</p>
                      {question.help && <p className="text-muted mt-0.5 text-xs">{question.help}</p>}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={question.text}>
                      {ANSWERS.map((option) => {
                        const selected = current === option.value;
                        return (
                          <button
                            key={option.label}
                            type="button"
                            disabled={off}
                            aria-pressed={selected}
                            aria-label={`${option.label}: ${question.criterion}`}
                            onClick={() => answer(question.id, option.value)}
                            className={`min-h-[40px] rounded-lg border text-sm font-medium transition-colors ${
                              selected
                                ? option.value === 1
                                  ? 'border-success bg-success-bg text-success'
                                  : option.value === -1
                                    ? 'border-danger bg-danger-bg text-danger'
                                    : 'border-primary bg-primary/10 text-foreground'
                                : 'border-border text-muted'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <label className="text-muted flex flex-col gap-1.5 text-sm font-medium">
          Quantidade de cotas
          <input
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0"
            className="border-border bg-background text-foreground focus:ring-primary min-h-[44px] rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
          <span className="text-muted text-xs font-normal">
            Atualizada em {formatDate(asset.quantityUpdatedOn)}
            {type.fractionDigits > 0 ? ' · aceita fração' : ''}
          </span>
        </label>

        <OptionalText label="Setor" value={sector} onChange={setSector} maxLength={100} />
        <OptionalText label="Subsetor" value={subsector} onChange={setSubsector} maxLength={100} />
        <OptionalText label="Observação" value={note} onChange={setNote} multiline maxLength={500} />

        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="text-danger min-h-[40px] text-sm font-semibold"
        >
          Remover ativo
        </button>
      </form>
    </BottomSheet>
  );
}
