import { apiRoute, readJson } from '@/lib/server/http';
import { pushTestSchema } from '@/lib/server/validation';

export const POST = apiRoute(async ({ request, push }) => {
  const { deviceId } = await readJson(request, pushTestSchema);
  return push.sendTest(deviceId);
});
