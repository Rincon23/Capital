import { apiRoute } from '@/lib/server/http';
import { monthKeySchema } from '@/lib/server/validation';

export const POST = apiRoute<{ month: string }>(async ({ params, repo }) => {
  await repo.closeMonth(monthKeySchema.parse(params.month));
});
