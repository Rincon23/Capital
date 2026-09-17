'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { NavEditor } from '@/components/modules/NavEditor';

export default function Page() {
  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      <PageHeader title="Rodapé" subtitle="Escolha e ordene os ícones de baixo" backHref="/mais" />
      <div className="px-4">
        <NavEditor />
      </div>
    </div>
  );
}
