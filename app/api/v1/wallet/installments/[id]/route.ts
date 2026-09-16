import { HttpError, apiRoute, readJson } from '@/lib/server/http';
import { saveInstallmentSchema } from '@/lib/server/validation';

type Params = { id: string };

export const PUT = apiRoute<Params>(async ({ request, params, wallet }) => {
  const { plan, upfront } = await readJson(request, saveInstallmentSchema);
  if (plan.id !== params.id) {
    throw new HttpError(400, 'INVALID_INPUT', 'O id do parcelamento não confere com o endereço.');
  }
  await wallet.saveInstallment(plan, upfront);
});

export const DELETE = apiRoute<Params>(async ({ params, wallet }) => {
  await wallet.deleteInstallment(params.id);
});
