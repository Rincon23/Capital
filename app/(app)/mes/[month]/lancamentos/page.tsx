import { LancamentosScreen } from '@/components/screens/LancamentosScreen';

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const { aba } = await searchParams;
  // "?aba=a-receber" opens that tab (the "A receber" card on Início links there).
  return <LancamentosScreen initialTab={aba === 'a-receber' ? 'reimbursable' : undefined} />;
}
