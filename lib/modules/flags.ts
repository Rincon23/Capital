import type { BudgetSettings, ModuleFlags, ModuleKey } from '../budget/types';
import { MODULES, MODULE_KEYS, moduleDefinition } from './catalog';

/** Every module off: what a brand-new account gets. */
export const NO_MODULES: ModuleFlags = Object.fromEntries(
  MODULE_KEYS.map((key) => [key, false]),
) as unknown as ModuleFlags;

type FlagsSource = Pick<BudgetSettings, 'modules'> | Partial<ModuleFlags> | null | undefined;

/** The flags exactly as saved (absent means off), before any dependency is taken into account. */
export function storedModules(source: FlagsSource): ModuleFlags {
  const modules: Partial<ModuleFlags> | null | undefined =
    source && 'modules' in source ? source.modules : (source as Partial<ModuleFlags> | null | undefined);
  const stored = { ...NO_MODULES };
  for (const key of MODULE_KEYS) stored[key] = modules?.[key] === true;
  return stored;
}

/**
 * Which modules are actually on. A module counts as on only while everything it depends on is
 * on too: a child can never work without its parent, whatever was saved (an old backup, a direct
 * API call). This is what every screen and the server check.
 */
export function resolveModules(source: FlagsSource): ModuleFlags {
  const stored = storedModules(source);
  const resolved = { ...NO_MODULES };
  // Catalog order puts every module after its dependencies, so one pass is enough.
  for (const definition of MODULES) {
    resolved[definition.key] = stored[definition.key] && definition.dependsOn.every((dep) => resolved[dep]);
  }
  return resolved;
}

export function isModuleOn(source: FlagsSource, key: ModuleKey): boolean {
  return resolveModules(source)[key];
}

/** What decides which modules an account may turn on. */
export interface ModuleAccess {
  /** A VIP account (the owner always is): may turn on every module. */
  vip: boolean;
  /** The modules only VIP accounts can turn on, as the owner set them in Administração. */
  vipModules: ModuleKey[];
}

/** The VIP-only modules before the owner changes anything (`ModuleDefinition.vipByDefault`). */
export const DEFAULT_VIP_MODULES: ModuleKey[] = MODULES.filter((definition) => definition.vipByDefault).map(
  (definition) => definition.key,
);

/**
 * The VIP-only modules from the owner's choices ("Só VIP" in Administração, one per module): a
 * module the owner never touched keeps its default. In catalog order.
 */
export function vipModulesFrom(choices: Partial<Record<ModuleKey, boolean>>): ModuleKey[] {
  return MODULES.filter((definition) => choices[definition.key] ?? definition.vipByDefault === true).map(
    (definition) => definition.key,
  );
}

/** Whether this account may turn `key` on by itself (it may still need another module first). */
export function mayUseModule(access: ModuleAccess, key: ModuleKey): boolean {
  return access.vip || !access.vipModules.includes(key);
}

/**
 * The VIP-only module that keeps `key` out of this account's reach: `key` itself, or one it needs
 * (with Lançamentos only for VIP, so is everything built on it). Null when nothing does.
 */
export function vipLockOf(access: ModuleAccess, key: ModuleKey): ModuleKey | null {
  if (!mayUseModule(access, key)) return key;
  for (const dep of moduleDefinition(key).dependsOn) {
    const lock = vipLockOf(access, dep);
    if (lock) return lock;
  }
  return null;
}

/**
 * Whether `key` is hidden from this account: a restricted module ("Restrito" in Administração), or
 * one built on it, never shows up for an account without access — not in Módulos, not in the
 * widget tray, and its address answers "not found". Nobody else learns it exists.
 */
export function isModuleHidden(access: ModuleAccess, key: ModuleKey): boolean {
  return vipLockOf(access, key) !== null;
}

/**
 * The settings as this account may have them: for anyone who is not VIP, the VIP-only modules
 * are off, whatever was saved (an old backup, a direct API call, a VIP status taken back).
 */
export function withAccessRules<T extends Pick<BudgetSettings, 'modules'>>(
  settings: T,
  access: ModuleAccess,
): T {
  if (access.vip || !settings.modules) return settings;
  const modules = { ...settings.modules };
  for (const key of access.vipModules) if (modules[key]) modules[key] = false;
  return { ...settings, modules };
}

/** The direct dependencies of `key` that are off, which is what blocks turning it on. */
export function missingDependencies(source: FlagsSource, key: ModuleKey): ModuleKey[] {
  const resolved = resolveModules(source);
  return moduleDefinition(key).dependsOn.filter((dep) => !resolved[dep]);
}

/**
 * Everything that has to be turned on, in order, before `key` can be: its dependencies that are
 * off, and theirs (Histórico with nothing on: Lançamentos, then Gastos por categoria).
 */
export function modulesToTurnOnFirst(source: FlagsSource, key: ModuleKey): ModuleKey[] {
  const resolved = resolveModules(source);
  return MODULE_KEYS.filter((candidate) => requires(key, candidate) && !resolved[candidate]);
}

/**
 * The locked module's nearest blocker(s): the missing dependencies that are not themselves waiting
 * on another missing one. Parcelados with nothing on shows "Cartão de crédito", not Lançamentos
 * too, because Cartão already says it needs Lançamentos.
 */
export function nearestMissing(source: FlagsSource, key: ModuleKey): ModuleKey[] {
  const missing = missingDependencies(source, key);
  return missing.filter((dep) => !missing.some((other) => other !== dep && requires(other, dep)));
}

/** Every module that needs `key`, directly or through another module, in catalog order. */
export function dependentsOf(key: ModuleKey): ModuleKey[] {
  const found = new Set<ModuleKey>();
  for (const definition of MODULES) {
    if (definition.dependsOn.some((dep) => dep === key || found.has(dep))) found.add(definition.key);
  }
  return MODULE_KEYS.filter((candidate) => found.has(candidate));
}

/**
 * The one module a module hangs from in the module tree: of its dependencies, the one that isn't
 * already required by another of them (Parcelados needs Lançamentos and Cartão, and Cartão needs
 * Lançamentos, so it hangs from Cartão). Null for modules that depend on nothing.
 */
export function parentOf(key: ModuleKey): ModuleKey | null {
  const deps = moduleDefinition(key).dependsOn;
  const direct = deps.filter((dep) => !deps.some((other) => other !== dep && requires(other, dep)));
  return direct[0] ?? null;
}

/** Whether `key` needs `other`, directly or not. */
function requires(key: ModuleKey, other: ModuleKey): boolean {
  return moduleDefinition(key).dependsOn.some((dep) => dep === other || requires(dep, other));
}

export interface ModuleTreeNode {
  key: ModuleKey;
  children: ModuleTreeNode[];
}

/** The modules as a tree (children under the module they hang from), in catalog order. */
export function moduleTree(): ModuleTreeNode[] {
  const build = (parent: ModuleKey | null): ModuleTreeNode[] =>
    MODULE_KEYS.filter((key) => parentOf(key) === parent).map((key) => ({
      key,
      children: build(key),
    }));
  return build(null);
}

export type TurnOnResult =
  | { ok: true; modules: ModuleFlags }
  /** Nothing changed: these modules have to be turned on first. */
  | { ok: false; missing: ModuleKey[] };

/** Turns a module on, unless something it depends on is off (it never turns a parent on by itself). */
export function turnModuleOn(source: FlagsSource, key: ModuleKey): TurnOnResult {
  const missing = missingDependencies(source, key);
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, modules: { ...resolveModules(source), [key]: true } };
}

/**
 * Turns several modules on at once: a set the person picked as a whole (a kit of "Como você quer
 * usar o Capital?"), so a parent comes on together with its child — both were asked for. Nothing
 * changes if one of them needs a module that is off and not in the set.
 */
export function turnModulesOn(source: FlagsSource, keys: ModuleKey[]): TurnOnResult {
  const modules = resolveModules(source);
  // Catalog order puts every module after its dependencies, so a parent in the set comes on first.
  for (const definition of MODULES) {
    if (!keys.includes(definition.key)) continue;
    const missing = definition.dependsOn.filter((dep) => !modules[dep]);
    if (missing.length > 0) return { ok: false, missing };
    modules[definition.key] = true;
  }
  return { ok: true, modules };
}

/**
 * Turns a module off together with every module that depends on it (they could not work without
 * it). `alsoOff` lists those that were on, for the confirmation and the toast. No data is touched.
 */
export function turnModuleOff(
  source: FlagsSource,
  key: ModuleKey,
): { modules: ModuleFlags; alsoOff: ModuleKey[] } {
  const current = resolveModules(source);
  const alsoOff = dependentsOf(key).filter((dependent) => current[dependent]);
  const modules = { ...current, [key]: false };
  for (const dependent of alsoOff) modules[dependent] = false;
  return { modules, alsoOff };
}
