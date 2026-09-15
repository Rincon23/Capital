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

export const settingsSchema = z.object({
  topics: z.array(topicSchema),
  specialCategories: z.object({ fixedCost: z.string(), unforeseen: z.string() }),
  specialCategoryColors: z
    .object({ fixedCost: z.string(), unforeseen: z.string() })
    .partial()
    .optional(),
  onboardingCompleted: z.boolean().optional(),
});

export const incomeSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().max(500),
  amount: z.number(),
  date: z.preprocess(absentAsUndefined, isoDate.optional()),
});

export const expenseSchema = z.object({
  id: z.string().min(1).max(100),
  categoryKind: z.enum(['topic', 'fixedCost', 'unforeseen']),
  topicId: z.preprocess(absentAsUndefined, z.string().optional()),
  description: z.string().max(500),
  amount: z.number(),
  date: isoDate,
  singleInstallmentCard: z.boolean().optional(),
});

export const monthDataSchema = z.object({
  month: monthKeySchema,
  incomes: z.array(incomeSchema),
  expenses: z.array(expenseSchema),
  carryIn: z.record(z.string(), z.number()),
  topicsSnapshot: z.array(topicSchema),
  closed: z.boolean().optional(),
});

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  settings: settingsSchema,
  months: z.array(monthDataSchema),
});
