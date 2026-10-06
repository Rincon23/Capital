import {
  CalendarDays,
  ChartColumn,
  ChartPie,
  Clock,
  CreditCard,
  HandCoins,
  House,
  Mail,
  Mic,
  PiggyBank,
  ReceiptText,
  Repeat,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import type { HomeWidgetKey, ModuleKey, NavKey } from '@/lib/budget';
import type { IconTone } from '@/components/ui/IconTile';

export interface ModuleVisual {
  icon: LucideIcon;
  tone: IconTone;
}

/** The icon and colour that identify each module everywhere: bottom bar, Mais, cards and the module list. */
export const MODULE_VISUALS: Record<ModuleKey, ModuleVisual> = {
  expenses: { icon: ReceiptText, tone: 'blue' },
  budget: { icon: ChartPie, tone: 'purple' },
  card: { icon: CreditCard, tone: 'orange' },
  reimbursable: { icon: HandCoins, tone: 'green' },
  history: { icon: ChartColumn, tone: 'pink' },
  recurring: { icon: Repeat, tone: 'blue' },
  investments: { icon: PiggyBank, tone: 'green' },
  cash: { icon: Scale, tone: 'purple' },
  reminders: { icon: Clock, tone: 'amber' },
  voice: { icon: Mic, tone: 'pink' },
  gmail: { icon: Mail, tone: 'red' },
};

export const HOME_VISUAL: ModuleVisual = { icon: House, tone: 'neutral' };

export function navVisual(key: NavKey): ModuleVisual {
  return key === 'inicio' ? HOME_VISUAL : MODULE_VISUALS[key];
}

/** The icon of an Início widget: its module's, except for the extra widgets, which have their own. */
export function widgetVisual(key: HomeWidgetKey): ModuleVisual {
  return key === 'calendar' ? { icon: CalendarDays, tone: 'blue' } : MODULE_VISUALS[key];
}
