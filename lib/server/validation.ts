import { z } from 'zod';

/** Validates everything the API receives. Unknown keys are dropped. */

export const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido.');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
/** Older data may carry null or '' where a field is simply absent. */
const absentAsUndefined = (value: unknown) => (value === null || value === '' ? undefined : value);

const topicSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  targetPct: z.number(),
  order: z.number(),
  archived: z.boolean().optional(),
  color: z.string().optional(),
});

/** Every optional module, as booleans. Anything absent stays off (see `resolveModules`). */
const modulesSchema = z
  .object({
    reimbursable: z.boolean(),
    recurring: z.boolean(),
    installments: z.boolean(),
    investments: z.boolean(),
    cash: z.boolean(),
    reminders: z.boolean(),
    voice: z.boolean(),
    gmail: z.boolean(),
  })
  .partial();

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
});

/** An "À vista" plan may also be launched as a single expense when it is created. */
export const saveInstallmentSchema = z.object({
  plan: installmentPlanSchema,
  upfront: z.object({ month: monthKeySchema, date: isoDate }).optional(),
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

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido.');

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

/** "Realizado ✅" from a notification: only the signed token, no session. */
export const reminderActionSchema = z.object({ token: z.string().min(10).max(2000) });

/** Body of "enviar notificação de teste": one device, or all of them. */
export const pushTestSchema = z.object({ deviceId: z.uuid().optional() });

/** "Descreva o gasto": the sentence the AI reads. */
export const aiExpenseTextSchema = z.object({ text: z.string().trim().min(1).max(500) });

/** Body of "fechar mês": whether to open the next month in the same transaction. */
export const closeMonthSchema = z.object({ openNext: z.boolean().optional() });

export const backupSchema = z.object({
  // v2 added the modules and the "A receber" category; a v1 file still imports fine.
  version: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string(),
  settings: settingsSchema,
  months: z.array(monthDataSchema),
});
