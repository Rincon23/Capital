'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { Minus, Plus, Rows2, Square } from 'lucide-react';
import type { HomeWidgetKey } from '@/lib/budget';
import { hiddenHomeCards, widgetDescription, widgetName } from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { IconTile } from '@/components/ui/IconTile';
import { useToast } from '@/components/ui/Toast';
import { widgetVisual } from '../visuals';
import { Card, HomeCardsData, RESIZABLE_HOME_CARDS, effectiveSize } from './HomeCards';

/** How long a card has to be held before it comes loose, the way a phone picks up a widget. */
const HOLD_MS = 240;
/** How much the finger may wander during that hold before it counts as a scroll, not a hold. */
const HOLD_TOLERANCE = 8;

/**
 * Keeps the cards measured while they move around. With cards of two widths (half and full), a
 * stale measurement is what makes one land in the wrong slot and snap into place afterwards.
 */
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

const nameOf = (id: string | number) => widgetName(id as HomeWidgetKey);

const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Você pegou ${nameOf(active.id)}.`,
  onDragOver: ({ active, over }) =>
    over ? `${nameOf(active.id)} está sobre ${nameOf(over.id)}.` : `${nameOf(active.id)} está fora da grade.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `${nameOf(active.id)} foi solto no lugar de ${nameOf(over.id)}.`
      : `${nameOf(active.id)} foi solto.`,
  onDragCancel: () => 'Arraste cancelado.',
};

/**
 * "Organizar Início" ao vivo: segure um card (o lápis liga isto) e arraste para qualquer lugar —
 * os outros vão se ajustando, igual mexer nos widgets da tela do Android. Os que aceitam também
 * têm um botão para esticar para a linha toda ou voltar a dividir; o "−" tira o widget da Início
 * (o módulo continua ligado) e "Adicionar widget" traz de volta. Cada mudança já salva na hora.
 */
export function EditableHomeCards({
  keys,
  sizes,
}: {
  keys: HomeWidgetKey[];
  sizes: Partial<Record<HomeWidgetKey, 'half' | 'full'>>;
}) {
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  const [order, setOrder] = useState(keys);
  const [adding, setAdding] = useState(false);
  const hidden = settings ? hiddenHomeCards(settings) : [];

  useEffect(() => {
    // A module could turn on/off from another tab while this one is open; follow the new set,
    // but never fight an order already being dragged (see `persistOrder`, which updates this too).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder((current) => (current.join() === keys.join() ? current : keys));
  }, [keys]);

  // Hold, then drag — never drag straight away: a card only comes loose after the finger has
  // stayed on it, so brushing past one while reading never moves anything.
  //
  // The touch half is deliberately the `TouchSensor` and not the `PointerSensor`: the pointer one
  // can only stop the page from scrolling under the finger with `touch-action: none`, and with the
  // cards covering the whole screen that left "Organizar Início" impossible to scroll at all. The
  // touch sensor blocks the scroll from inside, once the card is really loose, so até lá o dedo
  // rola a tela como em qualquer outra página — que é como a tela inicial do celular se comporta.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistOrder(next: HomeWidgetKey[]) {
    setOrder(next);
    if (!settings) return;
    try {
      await saveSettings({ ...settings, homeOrder: next });
    } catch {
      showToast('Não foi possível salvar a ordem. Tente de novo.', 'error');
    }
  }

  async function toggleSize(key: HomeWidgetKey) {
    if (!settings) return;
    const next: 'half' | 'full' = (sizes[key] ?? 'half') === 'half' ? 'full' : 'half';
    try {
      await saveSettings({ ...settings, homeCardSizes: { ...sizes, [key]: next } });
    } catch {
      showToast('Não foi possível salvar o tamanho. Tente de novo.', 'error');
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = order.indexOf(active.id as HomeWidgetKey);
    const to = order.indexOf(over.id as HomeWidgetKey);
    void persistOrder(arrayMove(order, from, to));
  }

  /** Takes a widget off the Início; the module stays on, and "Adicionar widget" brings it back. */
  async function remove(key: HomeWidgetKey) {
    if (!settings) return;
    const previous = order;
    const next = order.filter((item) => item !== key);
    setOrder(next);
    try {
      await saveSettings({
        ...settings,
        homeOrder: next,
        homeHidden: [...(settings.homeHidden ?? []).filter((item) => item !== key), key],
      });
    } catch {
      setOrder(previous);
      showToast('Não foi possível remover. Tente de novo.', 'error');
    }
  }

  /** Puts a widget back, at the end of the Início. */
  async function add(key: HomeWidgetKey) {
    if (!settings) return;
    try {
      await saveSettings({
        ...settings,
        homeOrder: [...order.filter((item) => item !== key), key],
        homeHidden: (settings.homeHidden ?? []).filter((item) => item !== key),
      });
      setAdding(false);
      showToast(`${widgetName(key)} voltou para a Início.`);
    } catch {
      showToast('Não foi possível adicionar. Tente de novo.', 'error');
    }
  }

  async function restoreDefault() {
    if (!settings) return;
    try {
      await saveSettings({ ...settings, homeOrder: null, homeCardSizes: {}, homeHidden: [] });
    } catch {
      showToast('Não foi possível restaurar. Tente de novo.', 'error');
    }
  }

  return (
    <>
      <HomeCardsData keys={order}>
        <div className="flex flex-col gap-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            measuring={MEASURING}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements: ANNOUNCEMENTS }}
          >
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3" data-no-swipe-nav>
                {order.map((key) => (
                  <SortableCard
                    key={key}
                    cardKey={key}
                    size={effectiveSize(key, sizes) ?? 'half'}
                    resizable={RESIZABLE_HOME_CARDS.includes(key)}
                    onToggleSize={() => void toggleSize(key)}
                    onRemove={() => void remove(key)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="border-primary/50 text-primary hover:bg-primary/5 flex min-h-[56px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold"
          >
            <Plus aria-hidden className="h-5 w-5" />
            Adicionar widget
            {hidden.length > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                {hidden.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void restoreDefault()}
            className="text-muted hover:text-foreground self-center text-sm font-medium underline underline-offset-2"
          >
            Voltar ao padrão
          </button>
        </div>
      </HomeCardsData>

      {adding && (
        <BottomSheet open title="Adicionar widget" onClose={() => setAdding(false)}>
          <div className="flex flex-col gap-3">
            {hidden.length === 0 ? (
              <p className="text-muted text-sm">
                Todos os widgets dos módulos que você usa já estão na Início.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {hidden.map((key) => {
                  const visual = widgetVisual(key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => void add(key)}
                        className="border-border bg-background hover:border-primary/40 flex w-full items-center gap-3 rounded-xl border p-3 text-left"
                      >
                        <IconTile icon={visual.icon} tone={visual.tone} />
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground block font-medium">{widgetName(key)}</span>
                          <span className="text-muted block text-xs">{widgetDescription(key)}</span>
                        </span>
                        <span className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                          <Plus aria-hidden className="h-4 w-4" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-muted text-xs">
              Cada módulo ligado traz o seu widget.{' '}
              <Link href="/modulos" className="text-primary font-semibold">
                Ligar outros módulos
              </Link>
            </p>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

function SortableCard({
  cardKey,
  size,
  resizable,
  onToggleSize,
  onRemove,
}: {
  cardKey: HomeWidgetKey;
  size: 'half' | 'full';
  resizable: boolean;
  onToggleSize: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardKey,
  });

  return (
    <div
      ref={setNodeRef}
      // `CSS.Translate`, not `CSS.Transform`: the sortable transform of a grid with cards of two
      // widths also carries a scale, which is what stretched a card out of shape mid-move before
      // it snapped back on landing. Only the movement is wanted; every card keeps its own size.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative min-w-0 ${size === 'full' ? 'col-span-2' : 'col-span-1'} ${isDragging ? 'z-20' : ''}`}
    >
      <div
        className={`pointer-events-none rounded-2xl transition-[transform,box-shadow,opacity] duration-150 ${
          isDragging ? 'scale-[1.03] opacity-90 shadow-2xl' : ''
        }`}
      >
        <Card moduleKey={cardKey} />
      </div>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Segurar e arrastar ${widgetName(cardKey)} para reorganizar`}
        className="ring-primary/60 active:bg-primary/5 ring-dashed absolute inset-0 touch-manipulation rounded-2xl ring-2"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover ${widgetName(cardKey)} da Início`}
        title="Remover da Início"
        className="bg-danger-fill absolute -top-2 -left-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-md"
      >
        <Minus aria-hidden className="h-4 w-4" />
      </button>
      {resizable && (
        <button
          type="button"
          onClick={onToggleSize}
          aria-label={
            size === 'full'
              ? `Dividir a linha de ${widgetName(cardKey)}`
              : `Esticar ${widgetName(cardKey)} para a linha toda`
          }
          title={size === 'full' ? 'Linha inteira — toque para dividir' : 'Metade — toque para esticar'}
          className="bg-primary text-primary-foreground absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-md"
        >
          {size === 'full' ? (
            <Rows2 aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <Square aria-hidden className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
