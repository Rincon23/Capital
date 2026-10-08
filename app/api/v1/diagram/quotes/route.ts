import { apiRoute } from '@/lib/server/http';

/** "Atualizar cotações": every asset of the account, from the free sources, now. */
export const POST = apiRoute(({ diagram }) => diagram.refreshQuotes());
