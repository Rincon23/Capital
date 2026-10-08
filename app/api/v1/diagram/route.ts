import { apiRoute } from '@/lib/server/http';

/** Everything the Diagrama screen shows: targets, assets with their quotes, questions, answers. */
export const GET = apiRoute(({ diagram }) => diagram.getOverview());
