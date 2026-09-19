'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Rows2, Square } from 'lucide-react';
import type { ModuleKey } from '@/lib/budget';
import { moduleDefinition } from '@/lib/modules';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useToast } from '@/components/ui/Toast';
import { Card, RESIZABLE_HOME_CARDS, effectiveSize } from './HomeCards';

const WALLET: ModuleKey[] = ['card', 'recurring', 'investments', 'cash'];

/** How long a card has to be held before it comes loose, the way a phone picks up a widget. */
const HOLD_MS = 240;
/** How much the finger may wander during that hold before it counts as a scroll, not a hold. */
const HOLD_TOLERANCE = 8;

/**
 * Keeps the cards measured while they move around. With cards of two widths (half and full), a
 * stale measurement is what makes one land in the wrong slot and snap into place afterwards.
 */
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };

const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Você pegou ${moduleDefinition(active.id as ModuleKey).name}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${moduleDefinition(active.id as ModuleKey).name} está sobre ${moduleDefinition(over.id as ModuleKey).name}.`
      : `${moduleDefinition(active.id as ModuleKey).name} está fora da grade.`,
  onDragEnd: ({ active, over }) =>
    over
      ? `${moduleDefinition(active.id as ModuleKey).name} foi solto no lugar de ${moduleDefinition(over.id as ModuleKey).name}.`
      : `${moduleDefinition(active.id as ModuleKey).name} foi solto.`,
  onDragCancel: () => 'Arraste cancelado.',
};

/**
 * "Organizar Início" ao vivo: segure um card (o lápis liga isto) e arraste para qualquer lugar —
 * os outros vão se ajustando, igual mexer nos widgets da tela do Android. Os que aceitam também
 * têm um botão para esticar para a linha toda ou voltar a dividir. Cada solta e cada troca de
 * tamanho já salva na hora.
 */
export function EditableHomeCards({
  keys,
  sizes,
}: {
  keys: ModuleKey[];
  sizes: Partial<Record<ModuleKey, 'half' | 'full'>>;
}) {
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  const [order, setOrder] = useState(keys);

  useEffect(() => {
    // A module could turn on/off from another tab while this one is open; follow the new set,
    // but never fight an order already being dragged (see `persistOrder`, which updates this too).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder((current) => (current.join() === keys.join() ? current : keys));
  }, [keys]);

  // Hold, then drag — never drag straight away: a card only comes loose after the finger has
  // stayed on it, so brushing past one while reading never moves anything.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: HOLD_MS, tolerance: HOLD_TOLERANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistOrder(next: ModuleKey[]) {
    setOrder(next);
    if (!settings) return;
    try {
      await saveSettings({ ...settings, homeOrder: next });
    } catch {
      showToast('Não foi possível salvar a ordem. Tente de novo.', 'error');
    }
  }

  async function toggleSize(key: ModuleKey) {
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
    const from = order.indexOf(active.id as ModuleKey);
    const to = order.indexOf(over.id as ModuleKey);
    void persistOrder(arrayMove(order, from, to));
  }

  async function restoreDefault() {
    if (!settings) return;
    try {
      await saveSettings({ ...settings, homeOrder: null, homeCardSizes: {} });
    } catch {
      showToast('Não foi possível restaurar. Tente de novo.', 'error');
    }
  }

  const content = (
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
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={() => void restoreDefault()}
        className="text-muted hover:text-foreground self-center text-sm font-medium underline underline-offset-2"
      >
        Voltar ao padrão
      </button>
    </div>
  );

  return order.some((key) => WALLET.includes(key)) ? <WalletProvider>{content}</WalletProvider> : content;
}

function SortableCard({
  cardKey,
  size,
  resizable,
  onToggleSize,
}: {
  cardKey: ModuleKey;
  size: 'half' | 'full';
  resizable: boolean;
  onToggleSize: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardKey });

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
        aria-label={`Segurar e arrastar ${moduleDefinition(cardKey).name} para reorganizar`}
        className="ring-primary/60 active:bg-primary/5 absolute inset-0 touch-none rounded-2xl ring-2 ring-dashed"
      />
      {resizable && (
        <button
          type="button"
          onClick={onToggleSize}
          aria-label={size === 'full' ? `Dividir a linha de ${moduleDefinition(cardKey).name}` : `Esticar ${moduleDefinition(cardKey).name} para a linha toda`}
          title={size === 'full' ? 'Linha inteira — toque para dividir' : 'Metade — toque para esticar'}
          className="bg-primary text-primary-foreground absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-md"
        >
          {size === 'full' ? <Rows2 aria-hidden className="h-3.5 w-3.5" /> : <Square aria-hidden className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
