import { apiRoute } from '@/lib/server/http';

/** Fetches a fresh quote from brapi.dev and caches it. */
export const POST = apiRoute(async ({ wallet }) => {
  await wallet.refreshPrice();
});
