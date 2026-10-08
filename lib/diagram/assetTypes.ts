import type { AssetType, DiagramTargets, FixedIncomeType, QuoteMarket, TickerType } from './types';

export interface AssetTypeDefinition {
  key: AssetType;
  label: string;
  /** For chips and narrow places. */
  shortLabel: string;
  /** Where the price comes from; absent for the fixed-income totals (typed by hand). */
  market?: QuoteMarket;
  /**
   * How many decimals of a quota can be bought: 0 for whole quotas (B3), more for the
   * international assets and crypto, which brokers sell in fractions.
   */
  fractionDigits: number;
  /** The CSS colour token of the type in the charts and chips (`--series-N`). */
  color: string;
  /** An example for the ticker field. */
  example?: string;
}

/** Every type, in the order the screens list them. */
export const ASSET_TYPES: AssetTypeDefinition[] = [
  {
    key: 'brStocks',
    label: 'Ações nacionais',
    shortLabel: 'Ações BR',
    market: 'b3',
    fractionDigits: 0,
    color: 'var(--series-1)',
    example: 'WEGE3',
  },
  {
    key: 'intlStocks',
    label: 'Ações internacionais',
    shortLabel: 'Ações EUA',
    market: 'us',
    fractionDigits: 6,
    color: 'var(--series-7)',
    example: 'VOO',
  },
  {
    key: 'fiis',
    label: 'Fundos imobiliários',
    shortLabel: 'FIIs',
    market: 'b3',
    fractionDigits: 0,
    color: 'var(--series-2)',
    example: 'HGLG11',
  },
  {
    key: 'reits',
    label: 'REITs',
    shortLabel: 'REITs',
    market: 'us',
    fractionDigits: 6,
    color: 'var(--series-5)',
    example: 'O',
  },
  {
    key: 'crypto',
    label: 'Criptomoedas',
    shortLabel: 'Cripto',
    market: 'crypto',
    fractionDigits: 8,
    color: 'var(--series-4)',
    example: 'BTC',
  },
  {
    key: 'fixedIncome',
    label: 'Renda fixa',
    shortLabel: 'Renda fixa',
    fractionDigits: 2,
    color: 'var(--series-3)',
  },
  {
    key: 'intlFixedIncome',
    label: 'Renda fixa internacional',
    shortLabel: 'RF exterior',
    fractionDigits: 2,
    color: 'var(--series-6)',
  },
];

export const ASSET_TYPE_KEYS: AssetType[] = ASSET_TYPES.map((type) => type.key);

export const FIXED_INCOME_TYPES: FixedIncomeType[] = ['fixedIncome', 'intlFixedIncome'];

/** The types that have assets, quotas, questions and scores. */
export const TICKER_TYPES = ASSET_TYPE_KEYS.filter(
  (key): key is TickerType => !FIXED_INCOME_TYPES.includes(key as FixedIncomeType),
);

const BY_KEY = new Map(ASSET_TYPES.map((type) => [type.key, type]));

export function assetType(key: AssetType): AssetTypeDefinition {
  const found = BY_KEY.get(key);
  if (!found) throw new Error(`Tipo desconhecido: ${key}`);
  return found;
}

export function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && BY_KEY.has(value as AssetType);
}

export function isFixedIncomeType(key: AssetType): key is FixedIncomeType {
  return FIXED_INCOME_TYPES.includes(key as FixedIncomeType);
}

/** The types in the person's portfolio (added, even at 0%), in screen order. */
export function typesInUse(targets: DiagramTargets): AssetType[] {
  return ASSET_TYPE_KEYS.filter((key) => targets[key] !== undefined);
}

/** The types that take part in an aporte: in the portfolio with a target above 0%. */
export function typesWithTarget(targets: DiagramTargets): AssetType[] {
  return ASSET_TYPE_KEYS.filter((key) => (targets[key] ?? 0) > 0);
}

/** The sum of the targets, as a 0..1 ratio (rounded so 0.1 + 0.2 reads as 0.3). */
export function targetsTotal(targets: DiagramTargets): number {
  const total = Object.values(targets).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return Math.round(total * 10_000) / 10_000;
}

/** Whether the targets can be saved: they add up to exactly 100%. */
export function targetsComplete(targets: DiagramTargets): boolean {
  return Math.abs(targetsTotal(targets) - 1) < 0.00005;
}

export interface TargetProfile {
  key: 'conservative' | 'moderate' | 'aggressive';
  label: string;
  description: string;
  targets: DiagramTargets;
}

/**
 * A profile in the order Ações internacionais / Ações nacionais / FIIs / REITs / Cripto / Renda
 * fixa / Renda fixa internacional, in %. Only the types above 0% are added.
 */
function profile(percents: [number, number, number, number, number, number, number]): DiagramTargets {
  const order: AssetType[] = [
    'intlStocks',
    'brStocks',
    'fiis',
    'reits',
    'crypto',
    'fixedIncome',
    'intlFixedIncome',
  ];
  const targets: DiagramTargets = {};
  order.forEach((key, index) => {
    if (percents[index] > 0) targets[key] = percents[index] / 100;
  });
  return targets;
}

/** Starting points for the targets; the person adjusts them afterwards. */
export const TARGET_PROFILES: TargetProfile[] = [
  {
    key: 'conservative',
    label: 'Conservador',
    description: 'A maior parte em renda fixa, um pouco em ações e fundos imobiliários.',
    targets: profile([2, 3, 10, 0, 0, 75, 10]),
  },
  {
    key: 'moderate',
    label: 'Moderado',
    description: 'Renda fixa e renda variável perto do meio a meio.',
    targets: profile([10, 15, 15, 5, 5, 40, 10]),
  },
  {
    key: 'aggressive',
    label: 'Arrojado',
    description: 'A maior parte em ações, aceitando mais sobe e desce.',
    targets: profile([20, 25, 15, 10, 10, 15, 5]),
  },
];
