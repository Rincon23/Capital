import { apiRoute, readJson } from '@/lib/server/http';
import { assignCardSchema } from '@/lib/server/validation';

type Params = { id: string };

/** Ties the card purchases of one competence that are on no card to this card. */
export const POST = apiRoute<Params>(async ({ request, params, wallet }) => {
  const { month } = await readJson(request, assignCardSchema);
  await wallet.assignMonthToCard({ cardId: params.id, month });
});
