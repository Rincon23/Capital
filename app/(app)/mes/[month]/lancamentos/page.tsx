import { LancamentosScreen } from '@/components/screens/LancamentosScreen';

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const { aba } = await searchParams;
  // "?aba=a-receber" opens the list already filtered to "A receber" (the card on Início links there).
  return <LancamentosScreen initialFilter={aba === 'a-receber' ? 'reimbursable' : undefined} />;
}
