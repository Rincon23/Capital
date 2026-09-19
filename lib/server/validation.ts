import { z } from 'zod';
import type { ModuleKey, NavKey } from '@/lib/budget';
import { MAX_NAV_ITEMS, MODULE_KEYS } from '@/lib/modules';
import type { NotificationCategory } from '@/lib/notifications';

const NOTIFICATION_CATEGORIES: NotificationCategory[] = ['reminder', 'card', 'gmail', 'feature', 'system'];

/** A partial map keyed by every module (or notification category): every key optional, like
 * `Partial<Record<K, V>>` — unlike `z.record` with an enum key, which demands every key present. */
function partialMap<K extends string, V extends z.ZodType>(keys: K[], value: V) {
  return z.object(Object.fromEntries(keys.map((key) => [key, value.optional()])) as Record<K, z.ZodOptional<V>>);
}

/** Validates everything the API receives. Unknown keys are dropped. */

export const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido.');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.');
/** Older data may carry null or '' where a field is simply absent. */
const absentAsUndefined = (value: unknown) => (value === null || value === '' ? undefined : value);

const topicSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  targetPct: z.number(),
  order: z.number(),
  archived: z.boolean().optional(),
  color: z.string().optional(),
  description: z.string().max(300, 'A descrição da categoria pode ter até 300 caracteres.').optional(),
  preset: z.enum(['diversos', 'investimentos', 'metas', 'conhecimentos']).optional(),
});

/** Every module, as booleans. Anything absent stays off (see `resolveModules`). */
const modulesSchema = z.object(
  Object.fromEntries(MODULE_KEYS.map((key) => [key, z.boolean().optional()])) as Record<
    ModuleKey,
    z.ZodOptional<z.ZodBoolean>
  >,
);

/** The bottom bar: Início or a module, at most four (resolveNav drops what no longer applies). */
const navSchema = z.array(z.enum(['inicio', ...MODULE_KEYS] as [NavKey, ...NavKey[]])).max(MAX_NAV_ITEMS);

export const settingsSchema = z.object({
  topics: z.array(topicSchema),
  specialCategories: z.object({
    fixedCost: z.string(),
    unforeseen: z.string(),
    // Older data (and backups from before the module existed) has no "A receber" label.
    reimbursable: z.string().optional(),
  }),
  specialCategoryColors: z
    .object({ fixedCost: z.string(), unforeseen: z.string(), reimbursable: z.string() })
    .partial()
    .optional(),
  onboardingCompleted: z.boolean().optional(),
  modules: modulesSchema.optional(),
  nav: navSchema.nullable().optional(),
  dismissedNotices: z.array(z.string().min(1).max(60)).max(200).optional(),
  notificationPrefs: partialMap(NOTIFICATION_CATEGORIES, z.boolean()).optional(),
  homeOrder: z.array(z.enum(MODULE_KEYS as [ModuleKey, ...ModuleKey[]])).nullable().optional(),
  homeCardSizes: partialMap(MODULE_KEYS, z.enum(['half', 'full'])).optional(),
});

export const incomeSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().max(500),
  amount: z.number(),
  date: z.preprocess(absentAsUndefined, isoDate.optional()),
});

const categoryKindSchema = z.enum(['topic', 'fixedCost', 'unforeseen', 'reimbursable']);

export const expenseSchema = z.object({
  id: z.string().min(1).max(100),
  categoryKind: categoryKindSchema,
  topicId: z.preprocess(absentAsUndefined, z.string().optional()),
  description: z.string().max(500),
  amount: z.number(),
  date: isoDate,
  singleInstallmentCard: z.boolean().optional(),
  cardId: z.preprocess(absentAsUndefined, z.string().max(100).optional()),
  source: z
    .enum(['form', 'voice', 'text', 'recurring', 'investment', 'installment', 'import'])
    .optional(),
  // Echoed back by the client when it edits an instalment's expense, so the link survives.
  installmentId: z.preprocess(absentAsUndefined, z.string().max(100).optional()),
  installmentNumber: z.preprocess(absentAsUndefined, z.number().int().positive().optional()),
});

export const monthDataSchema = z.object({
  month: monthKeySchema,
  incomes: z.array(incomeSchema),
  expenses: z.array(expenseSchema),
  carryIn: z.record(z.string(), z.number()),
  topicsSnapshot: z.array(topicSchema),
  closed: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Carteira
// ---------------------------------------------------------------------------

const money = z.number().finite();

export const recurringExpenseSchema = z.object({
  id: z.string().min(1).max(100),
  categoryKind: categoryKindSchema,
  topicId: z.preprocess(absentAsUndefined, z.string().optional()),
  description: z.string().min(1).max(500),
  amount: money.positive(),
  card: z.boolean(),
  cardId: z.preprocess(absentAsUndefined, z.string().max(100).optional()),
});

export const installmentPlanSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  categoryKind: categoryKindSchema,
  topicId: z.preprocess(absentAsUndefined, z.string().optional()),
  firstDebitDate: isoDate,
  count: z.number().int().min(1).max(120),
  totalAmount: money.positive(),
  accounting: z.enum(['installment', 'upfront']),
  cardId: z.preprocess(absentAsUndefined, z.string().max(100).optional()),
});

/** An "À vista" plan may also be launched as a single expense when it is created. */
export const saveInstallmentSchema = z.object({
  plan: installmentPlanSchema,
  upfront: z.object({ month: monthKeySchema, date: isoDate }).optional(),
});

export const creditCardSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, 'Dê um nome ao cartão.').max(60),
  dueDay: z.number().int().min(1).max(31),
  dueMonth: z.enum(['same', 'next']),
  notifyEnabled: z.boolean(),
  notifyBeforeDays: z.number().int().min(0).max(30),
  isDefault: z.boolean(),
  color: z.preprocess(absentAsUndefined, z.string().max(20).optional()),
  order: z.number().int().min(0).max(1000),
});

/** Tying the card purchases of one competence to a card. */
export const assignCardSchema = z.object({ month: monthKeySchema });

export const cardSettingsSchema = z.object({
  notifyTime: timeOfDay,
  repeatUntilPaid: z.boolean(),
});

export const investmentBucketSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  topicId: z.preprocess(absentAsUndefined, z.string().optional()),
  quotas: z.number().finite().min(0),
});

export const tickerSchema = z.object({ ticker: z.string().min(1).max(20) });

/** Buying is a positive delta, selling a negative one. */
export const tradeQuotasSchema = z.object({ delta: z.number().finite() });

export const allocateSchema = z.object({
  bucketId: z.string().min(1).max(100),
  amount: money.positive(),
  month: monthKeySchema,
  date: isoDate,
});

export const cashSettingsSchema = z.object({
  reserveAccountAmount: money.min(0),
  emergencyCosts: z
    .array(z.object({ label: z.string().max(200), amount: money.min(0) }))
    .max(50),
  reserveMultiplier: z.number().int().min(1).max(60),
});

/** A browser's `PushSubscription.toJSON()`. Push services only hand out https endpoints. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  previousEndpoint: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------


const reminderFields = {
  id: z.string().min(1).max(100),
  message: z.string().trim().min(1, 'Escreva o lembrete.').max(300),
  repeat: z.boolean(),
};

export const reminderInputSchema = z.discriminatedUnion('kind', [
  z.object({
    ...reminderFields,
    kind: z.literal('once'),
    date: isoDate,
    time: timeOfDay,
    notifyBeforeMinutes: z.union([z.literal(30), z.literal(60), z.literal(1440)]).nullable(),
  }),
  z.object({
    ...reminderFields,
    kind: z.literal('daily'),
    times: z.array(timeOfDay).min(1).max(12),
  }),
  z.object({
    ...reminderFields,
    kind: z.literal('weekly'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    time: timeOfDay,
  }),
  z.object({
    ...reminderFields,
    kind: z.literal('monthly'),
    dayOfMonth: z.number().int().min(1).max(31),
    time: timeOfDay,
  }),
]);

export const reminderSettingsSchema = z.object({
  repeatEnabled: z.boolean(),
  repeatTimes: z.array(timeOfDay).max(12),
});

export const reminderDoneSchema = z.object({ dueDate: isoDate, done: z.boolean() });

/** "Realizado ✅" / "Fatura paga ✅" from a notification: only the signed token, no session. */
export const actionTokenSchema = z.object({ token: z.string().min(10).max(2000) });

/** Body of "enviar notificação de teste": one device, or all of them. */
export const pushTestSchema = z.object({ deviceId: z.uuid().optional() });

/** "Descreva o gasto": the sentence the AI reads. */
export const aiExpenseTextSchema = z.object({ text: z.string().trim().min(1).max(500) });

/** A keyword for the Gmail monitor. */
export const gmailKeywordSchema = z.object({ keyword: z.string().trim().min(1).max(100) });

/** A failed analysis as the app saw it, for the server log. */
export const aiProblemReportSchema = z.object({
  kind: z.enum(['audio', 'text']),
  detail: z.string().max(1000),
});

/** Body of "fechar mês": whether to open the next month in the same transaction. */
export const closeMonthSchema = z.object({ openNext: z.boolean().optional() });

export const backupSchema = z.object({
  // v2 added the modules and the "A receber" category, v3 the bottom bar; older files still import.
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  exportedAt: z.string(),
  settings: settingsSchema,
  months: z.array(monthDataSchema),
});
