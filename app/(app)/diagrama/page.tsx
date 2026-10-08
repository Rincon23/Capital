import { DiagramaScreen, type DiagramTab } from '@/components/screens/DiagramaScreen';

const TABS: Record<string, DiagramTab> = {
  aporte: 'aporte',
  ativos: 'ativos',
};

export default async function DiagramaPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const { aba } = await searchParams;
  // "?aba=ativos" opens that tab (the module's tour walks through both).
  return <DiagramaScreen initialTab={typeof aba === 'string' ? TABS[aba] : undefined} />;
}
