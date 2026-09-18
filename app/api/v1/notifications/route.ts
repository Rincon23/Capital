import { apiRoute } from '@/lib/server/http';

/** The bell's history: everything the app has notified this account, most recent first. */
export const GET = apiRoute(async ({ notifications }) => notifications.list());
