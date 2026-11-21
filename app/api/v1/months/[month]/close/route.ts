import { apiRoute } from '@/lib/server/http';
import { assertMonthOver } from '@/lib/server/monthEnd';
import { closeMonthSchema, monthKeySchema } from '@/lib/server/validation';

export const POST = apiRoute<{ month: string }>(async ({ request, params, repo }) => {
  // The body is optional: an older client (or a plain POST) just closes the month.
  const body: unknown = await request.json().catch(() => ({}));
  const { openNext, dropLeftovers } = closeMonthSchema.parse(body ?? {});
  const month = monthKeySchema.parse(params.month);
  // A month is closed once it is over: the leftovers it passes on are only known then.
  assertMonthOver(month);
  await repo.closeMonth(month, openNext === true, dropLeftovers === true);
});
