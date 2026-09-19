'use client';

import type { CreditCard } from '@/lib/budget';
import { Chip } from './Chip';

/**
 * Which card a purchase went on. It shows up wherever something is marked as a card purchase —
 * the expense form, the recurring templates, the instalment plans — so the bill of each card
 * knows what belongs to it. With no card registered it renders nothing at all, and the card
 * question stays the plain yes/no it has always been.
 */
export function CardPicker({
  cards,
  value,
  onChange,
  label = 'Em qual cartão?',
  tourAnchor,
}: {
  cards: CreditCard[];
  value: string | undefined;
  onChange: (cardId: string | undefined) => void;
  label?: string;
  tourAnchor?: string;
}) {
  if (cards.length === 0) return null;
  // Only an entry that already had no card keeps the escape hatch, so nothing is silently
  // moved onto a card behind the person's back when they edit an old purchase.
  const allowNone = value === undefined;

  return (
    <div data-tour={tourAnchor}>
      <p className="text-muted mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {cards.map((card) => (
          <Chip
            key={card.id}
            label={card.name}
            selected={value === card.id}
            onClick={() => onChange(card.id)}
          />
        ))}
        {allowNone && <Chip label="Sem cartão" selected onClick={() => onChange(undefined)} />}
      </div>
      {allowNone && (
        <p className="text-muted mt-2 text-xs">
          Sem cartão, essa compra sai da dívida sozinha no dia 1º do mês seguinte.
        </p>
      )}
    </div>
  );
}
