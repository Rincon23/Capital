import type { BudgetSettings, ModuleFlags, ModuleKey } from './types';

/** Every module off: what an account that never opened the Módulos screen gets. */
export const NO_MODULES: ModuleFlags = {
  reimbursable: false,
  recurring: false,
  installments: false,
  investments: false,
  cash: false,
  reminders: false,
  voice: false,
  gmail: false,
};

export interface ModuleInfo {
  key: ModuleKey;
  name: string;
  description: string;
  /** False while the feature is still being built: it is listed, but cannot be turned on. */
  available: boolean;
  /** Only the owner (OWNER_EMAIL) may turn this one on. */
  ownerOnly?: boolean;
}

/**
 * The modules offered in Settings, in display order. `available` is what gates the toggle,
 * so a module ships the moment its screens exist and never before.
 */
export const MODULE_CATALOG: ModuleInfo[] = [
  {
    key: 'reimbursable',
    name: 'Categoria "A receber"',
    description:
      'Para compras no cartão que outra pessoa vai te devolver: entram na fatura, mas não gastam nenhuma categoria.',
    available: true,
  },
  {
    key: 'recurring',
    name: 'Gastos recorrentes',
    description: 'Modelos dos gastos que se repetem todo mês, lançados com um toque.',
    available: true,
  },
  {
    key: 'installments',
    name: 'Parcelados',
    description: 'Compras parceladas, com a parcela do mês lançada automaticamente.',
    available: true,
  },
  {
    key: 'investments',
    name: 'Reserva investida',
    description: 'Sua reserva em cotas, dividida em baldes por categoria.',
    available: true,
  },
  {
    key: 'cash',
    name: 'Caixa',
    description: 'Quanto você tem, quanto deve no cartão e quanto falta para a reserva.',
    available: true,
  },
  {
    key: 'reminders',
    name: 'Lembretes',
    description: 'Lembretes e tarefas do dia, com notificação no celular.',
    available: false,
  },
  {
    key: 'voice',
    name: 'Lançar por voz ou texto',
    description: 'Fale ou escreva o gasto e o app preenche o formulário para você conferir.',
    available: false,
    ownerOnly: true,
  },
  {
    key: 'gmail',
    name: 'Monitor de Gmail',
    description: 'Avisa quando chega um e-mail com uma das suas palavras-chave.',
    available: false,
    ownerOnly: true,
  },
];

/** The stored flags with every module resolved to a boolean (absent means off). */
export function resolveModules(
  source: Pick<BudgetSettings, 'modules'> | Partial<ModuleFlags> | null | undefined,
): ModuleFlags {
  const modules = source && 'modules' in source ? source.modules : source;
  return { ...NO_MODULES, ...modules };
}

export function isModuleOn(
  source: Pick<BudgetSettings, 'modules'> | Partial<ModuleFlags> | null | undefined,
  key: ModuleKey,
): boolean {
  return resolveModules(source)[key];
}
