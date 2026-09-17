'use client';

import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, LayoutGrid, Minus, Plus } from 'lucide-react';
import type { NavKey } from '@/lib/budget';
import {
  MAX_NAV_ITEMS,
  MORE_DIVIDER,
  changeNav,
  navEditorItems,
  navEntry,
  navFromEditor,
  resolveNav,
  type NavChange,
  type NavEditorItem,
} from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';
import { IconTile } from '@/components/ui/IconTile';
import { useToast } from '@/components/ui/Toast';
import { navVisual } from './visuals';

const labelOf = (id: UniqueIdentifier) => (id === MORE_DIVIDER ? 'a linha do Mais' : navEntry(id as NavKey).label);

/** What a screen reader hears while dragging (dnd-kit's defaults are in English). */
const ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Você pegou ${labelOf(active.id)}.`,
  onDragOver: ({ active, over }) =>
    over ? `${labelOf(active.id)} está sobre ${labelOf(over.id)}.` : `${labelOf(active.id)} está fora da lista.`,
  onDragEnd: ({ active, over }) =>
    over ? `${labelOf(active.id)} foi solto sobre ${labelOf(over.id)}.` : `${labelOf(active.id)} foi solto.`,
  onDragCancel: ({ active }) => `Arraste cancelado. ${labelOf(active.id)} voltou para o lugar.`,
};

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    'Para pegar um item, aperte espaço ou Enter. Use as setas para cima e para baixo para mover, espaço ou Enter para soltar e Esc para cancelar.',
};

/**
 * Picking and ordering the bottom bar: a live preview, then one list where everything above the
 * "Mais" line is in the bar (up to four) and everything below stays in Mais. Items are dragged by
 * their handle (touch, mouse or keyboard), or moved with the buttons on each row. Every change is
 * saved right away, with "Desfazer".
 */
export function NavEditor() {
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  /** The bar being saved, shown at once so the list never jumps back while the request runs. */
  const [pending, setPending] = useState<NavKey[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!settings) return null;

  const nav = pending ?? resolveNav(settings);
  const items = pending ? navEditorItems({ ...settings, nav: pending }) : navEditorItems(settings);

  async function apply(change: NavChange | { ok: true; nav: null; bumped: null }) {
    if (!settings) return;
    if (!change.ok) {
      showToast(
        change.reason === 'full'
          ? `O rodapé já tem ${MAX_NAV_ITEMS} ícones. Tire um antes de pôr outro.`
          : 'O rodapé precisa de pelo menos um ícone além do Mais.',
        'info',
      );
      return;
    }
    const previous = settings.nav ?? null;
    setPending(change.nav ?? resolveNav({ modules: settings.modules }));
    try {
      await saveSettings({ ...settings, nav: change.nav });
      showToast(
        change.bumped
          ? `Rodapé atualizado. ${navEntry(change.bumped).label} foi para o Mais.`
          : change.nav === null
            ? 'Rodapé de volta ao padrão.'
            : 'Rodapé atualizado.',
        'success',
        {
          action: {
            label: 'Desfazer',
            onClick: () =>
              void saveSettings({ ...settings, nav: previous }).catch(() =>
                showToast('Não foi possível desfazer. Tente de novo.', 'error'),
              ),
          },
        },
      );
    } catch {
      showToast('Não foi possível salvar o rodapé. Tente novamente.', 'error');
    } finally {
      setPending(null);
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.indexOf(active.id as NavEditorItem);
    const to = items.indexOf(over.id as NavEditorItem);
    void apply(navFromEditor(arrayMove(items, from, to), active.id as NavKey));
  }

  const divider = items.indexOf(MORE_DIVIDER);

  return (
    <div className="flex flex-col gap-4">
      <NavPreview nav={nav} />

      <p className="text-muted px-1 text-sm">
        Arraste pela alça <GripVertical aria-hidden className="inline h-4 w-4 align-text-bottom" /> para mudar
        a ordem. O que fica acima da linha do Mais aparece no rodapé (até {MAX_NAV_ITEMS}); o resto fica
        dentro do Mais.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements: ANNOUNCEMENTS, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <ul
            className="border-border bg-card flex flex-col gap-1 rounded-2xl border p-2 shadow-sm"
            data-tour="rodape-lista"
          >
            {items.map((item, index) =>
              item === MORE_DIVIDER ? (
                <DividerRow key={item} count={nav.length} />
              ) : (
                <NavRow
                  key={item}
                  item={item}
                  inBar={index < divider}
                  first={index === 0}
                  last={index === divider - 1}
                  onChange={(action) => void apply(changeNav(nav, item, action))}
                />
              ),
            )}
          </ul>
        </SortableContext>
      </DndContext>

      {settings.nav && (
        <button
          type="button"
          onClick={() =>
            // No saved choice: the bar follows the modules again (see resolveNav).
            void apply({ ok: true, nav: null, bumped: null })
          }
          className="text-muted hover:text-foreground self-center text-sm font-medium underline underline-offset-2"
        >
          Voltar ao padrão
        </button>
      )}
    </div>
  );
}

/** The bar as it will look, with the fixed "Mais" at the end. */
function NavPreview({ nav }: { nav: NavKey[] }) {
  return (
    <div
      aria-label={`Prévia do rodapé: ${nav.map((key) => navEntry(key).label).join(', ')} e Mais`}
      role="img"
      className="border-border bg-card flex items-stretch justify-around rounded-2xl border px-1 py-2 shadow-sm"
    >
      {nav.map((key) => {
        const Icon = navVisual(key).icon;
        return (
          <span
            key={key}
            className="text-foreground flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-medium"
          >
            <Icon aria-hidden className="h-6 w-6" strokeWidth={1.75} />
            <span className="max-w-full truncate">{navEntry(key).label}</span>
          </span>
        );
      })}
      <span className="text-muted flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-medium">
        <LayoutGrid aria-hidden className="h-6 w-6" strokeWidth={1.75} />
        Mais
      </span>
    </div>
  );
}

const ROW_BUTTON =
  'text-muted hover:text-foreground hover:bg-background flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-30';

function NavRow({
  item,
  inBar,
  first,
  last,
  onChange,
}: {
  item: NavKey;
  inBar: boolean;
  first: boolean;
  last: boolean;
  onChange: (action: 'up' | 'down' | 'add' | 'remove') => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item });
  const entry = navEntry(item);
  const visual = navVisual(item);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-card flex min-h-[56px] items-center gap-2 rounded-xl px-1 ${
        isDragging ? 'ring-primary relative z-10 shadow-lg ring-2' : ''
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Arrastar ${entry.label}`}
        className="text-muted flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="h-5 w-5" />
      </button>
      <IconTile icon={visual.icon} tone={visual.tone} />
      <span
        className={`min-w-0 flex-1 truncate text-sm font-medium ${inBar ? 'text-foreground' : 'text-muted'}`}
      >
        {entry.label}
      </span>
      {inBar ? (
        <>
          <button
            type="button"
            onClick={() => onChange('up')}
            disabled={first}
            aria-label={`Subir ${entry.label}`}
            className={ROW_BUTTON}
          >
            <ChevronUp aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onChange('down')}
            disabled={last}
            aria-label={`Descer ${entry.label}`}
            className={ROW_BUTTON}
          >
            <ChevronDown aria-hidden className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onChange('remove')}
            aria-label={`Tirar ${entry.label} do rodapé`}
            className={ROW_BUTTON}
          >
            <Minus aria-hidden className="h-5 w-5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onChange('add')}
          aria-label={`Pôr ${entry.label} no rodapé`}
          className={ROW_BUTTON}
        >
          <Plus aria-hidden className="h-5 w-5" />
        </button>
      )}
    </li>
  );
}

/** "Mais": not draggable, but items move around it to change sides. */
function DividerRow({ count }: { count: number }) {
  const { setNodeRef, transform, transition } = useSortable({ id: MORE_DIVIDER, disabled: true });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="text-muted my-1 flex items-center gap-2 px-2 text-xs font-semibold tracking-wide uppercase"
    >
      <span className="bg-border h-px flex-1" />
      <LayoutGrid aria-hidden className="h-4 w-4" />
      Fica no Mais · {count} de {MAX_NAV_ITEMS} no rodapé
      <span className="bg-border h-px flex-1" />
    </li>
  );
}
