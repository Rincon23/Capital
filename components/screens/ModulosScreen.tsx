'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, EyeOff, Lock } from 'lucide-react';
import type { ModuleFlags, ModuleKey } from '@/lib/budget';
import {
  MODULES,
  MODULE_GROUPS,
  dependentsOf,
  isModuleHidden,
  moduleDefinition,
  moduleNames,
  modulesToTurnOnFirst,
  nearestMissing,
  resolveModules,
  type ModuleAccess,
} from '@/lib/modules';
import { PageHeader } from '@/components/layout/PageHeader';
import { useHomeHref } from '@/components/modules/useHomeHref';
import { MODULE_VISUALS } from '@/components/modules/visuals';
import { turnOnTogetherLabel, useModuleSwitch } from '@/components/modules/useModuleSwitch';
import { useAuth } from '@/components/providers/AuthProvider';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { IconTile } from '@/components/ui/IconTile';
import { Switch } from '@/components/ui/Switch';

const ATTENTION_MS = 1800;

/**
 * Turning modules on and off: a card per module, in the groups of the app drawer — icon, name,
 * what it is in a few words and the switch; a tap on the card shows the full description. A module
 * that needs another one off says "Precisa de …", and trying it asks, in one sentence, to turn it
 * on together with what it needs ("Ligar os dois") — never turning anything on by itself. A
 * restricted module (and what is built on it) is left out for an account without access, and a
 * group left empty goes with it.
 */
export function ModulosScreen() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const { turnOn, turnOnWithParents, turnOff, busy } = useModuleSwitch();
  const confirm = useConfirm();
  const homeHref = useHomeHref();
  const [open, setOpen] = useState<ModuleKey | null>(null);
  const [attention, setAttention] = useState<ModuleKey[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  if (!settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const modules = resolveModules(settings);
  const groups = MODULE_GROUPS.map((group) => ({
    group,
    members: MODULES.filter(
      (definition) => definition.group === group.key && !isModuleHidden(user, definition.key),
    ),
  })).filter(({ members }) => members.length > 0);

  /** The modules that can be turned on now glow for a moment. */
  function callAttention(keys: ModuleKey[]) {
    setAttention(keys);
    timers.current.push(setTimeout(() => setAttention([]), ATTENTION_MS));
  }

  /** A locked module: one sentence, and the person decides whether to turn on both. */
  async function offerTogether(key: ModuleKey) {
    const needed = modulesToTurnOnFirst(settings, key);
    const name = moduleDefinition(key).name;
    const confirmed = await confirm({
      title: `Ligar ${name}?`,
      message: `Para usar ${name}, ligue também ${moduleNames(needed)}.`,
      confirmLabel: turnOnTogetherLabel(needed.length + 1),
      cancelLabel: 'Agora não',
    });
    if (confirmed) await turnOnWithParents(key);
  }

  async function handleToggle(key: ModuleKey, next: boolean) {
    if (next && isModuleHidden(user, key)) return;
    if (!next) {
      await turnOff(key);
      return;
    }
    const result = await turnOn(key);
    if (!result.ok) {
      await offerTogether(key);
      return;
    }
    // The modules that hang from this one can be turned on now: show where they are.
    const unlocked = dependentsOf(key).filter(
      (dependent) => moduleDefinition(dependent).dependsOn.includes(key) && !modules[dependent],
    );
    if (unlocked.length > 0) callAttention(unlocked);
  }

  return (
    <div className="flex flex-1 flex-col gap-5 pb-10">
      <PageHeader title="Módulos" subtitle="Escolha o que o seu Capital + tem" backHref={homeHref} />

      <p className="text-muted px-4 text-sm">Ligue só o que você usa. Desligar não apaga nada.</p>

      {groups.map(({ group, members }, index) => (
        <section
          key={group.key}
          className="flex flex-col gap-2 px-4"
          data-tour={index === 0 ? 'modulos-lista' : undefined}
        >
          <h2 className="text-muted px-1 text-xs font-semibold tracking-wide uppercase">{group.label}</h2>
          <ul className="border-border bg-card divide-border divide-y rounded-2xl border shadow-sm">
            {members.map((definition) => (
              <ModuleCard
                key={definition.key}
                moduleKey={definition.key}
                modules={modules}
                access={user}
                busy={busy}
                open={open === definition.key}
                glowing={attention.includes(definition.key)}
                onOpen={() => setOpen((current) => (current === definition.key ? null : definition.key))}
                onToggle={(next) => void handleToggle(definition.key, next)}
                onLocked={() => void offerTogether(definition.key)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ModuleCard({
  moduleKey,
  modules,
  access,
  busy,
  open,
  glowing,
  onOpen,
  onToggle,
  onLocked,
}: {
  moduleKey: ModuleKey;
  modules: ModuleFlags;
  /** Which modules are restricted: this account sees them only with access. */
  access: ModuleAccess;
  busy: boolean;
  /** The full description is showing. */
  open: boolean;
  glowing: boolean;
  onOpen: () => void;
  onToggle: (next: boolean) => void;
  /** A locked module was tried: offer to turn it on with what it needs. */
  onLocked: () => void;
}) {
  const info = moduleDefinition(moduleKey);
  const visual = MODULE_VISUALS[moduleKey];
  const on = modules[moduleKey];
  const blockers = on ? [] : nearestMissing({ modules }, moduleKey);
  const locked = blockers.length > 0;
  const detailsId = `modulo-${moduleKey}`;

  return (
    <li
      className={`flex flex-col gap-2 p-3 transition-colors ${glowing ? 'bg-primary/5 animate-attention' : ''}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className={`shrink-0 ${locked ? 'opacity-45 grayscale' : ''}`}>
            <IconTile icon={visual.icon} tone={visual.tone} />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`flex items-center gap-1.5 text-sm leading-tight font-semibold ${locked ? 'text-muted' : 'text-foreground'}`}
            >
              <span className="truncate">{info.name}</span>
              {access.vipModules.includes(moduleKey) && (
                <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                  <EyeOff aria-hidden className="h-3 w-3" />
                  Restrito
                </span>
              )}
              <ChevronDown
                aria-hidden
                className={`text-muted h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </span>
            <span className="text-muted mt-0.5 block text-xs">{info.tagline}</span>
          </span>
        </button>
        {locked ? (
          <button
            type="button"
            role="switch"
            aria-checked={false}
            aria-label={`${info.name}: precisa de ${moduleNames(blockers)}`}
            onClick={onLocked}
            className="bg-border/60 text-muted flex h-7 w-12 shrink-0 items-center justify-center rounded-full"
          >
            <Lock aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Switch
            checked={on}
            onChange={onToggle}
            label={`${info.name}, ${on ? 'ligado' : 'desligado'}`}
            disabled={busy}
          />
        )}
      </div>
      {locked && (
        <button
          type="button"
          onClick={onLocked}
          className="bg-background text-foreground border-border ml-[52px] inline-flex min-h-[32px] items-center gap-1.5 self-start rounded-full border px-2.5 text-left text-xs font-medium"
        >
          <Lock aria-hidden className="text-muted h-3 w-3 shrink-0" />
          <span>
            Precisa de <strong className="font-semibold">{moduleNames(blockers)}</strong>
          </span>
        </button>
      )}
      <div id={detailsId} hidden={!open} className="text-muted ml-[52px] text-xs leading-relaxed">
        {info.description}
      </div>
    </li>
  );
}
