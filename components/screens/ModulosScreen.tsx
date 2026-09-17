'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import type { ModuleFlags, ModuleKey } from '@/lib/budget';
import {
  dependentsOf,
  moduleDefinition,
  moduleNames,
  moduleTree,
  modulesToTurnOnFirst,
  nearestMissing,
  resolveModules,
  type ModuleTreeNode,
} from '@/lib/modules';
import { PageHeader } from '@/components/layout/PageHeader';
import { MODULE_VISUALS } from '@/components/modules/visuals';
import { useModuleSwitch } from '@/components/modules/useModuleSwitch';
import { useSettings } from '@/components/providers/SettingsProvider';
import { IconTile } from '@/components/ui/IconTile';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

const ATTENTION_MS = 1800;

/**
 * Turning modules on and off. They are laid out as a tree: a module that needs another sits
 * right under it, with a padlock while that one is off. Trying to turn a locked module on keeps
 * it off, says what to turn on first and points at it.
 */
export function ModulosScreen() {
  const { settings } = useSettings();
  const { turnOn, turnOff, busy } = useModuleSwitch();
  const { showToast } = useToast();
  const [shaking, setShaking] = useState<ModuleKey | null>(null);
  const [attention, setAttention] = useState<ModuleKey[]>([]);
  const rows = useRef(new Map<ModuleKey, HTMLDivElement>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  if (!settings) {
    return <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>;
  }

  const modules = resolveModules(settings);
  const tree = moduleTree();
  const branches = tree.filter((node) => node.children.length > 0);
  const standalone = tree.filter((node) => node.children.length === 0);

  function later(action: () => void, ms: number) {
    timers.current.push(setTimeout(action, ms));
  }

  /** Points at modules: they glow for a moment, and the first one is scrolled into view. */
  function callAttention(keys: ModuleKey[], scroll = true) {
    setAttention(keys);
    if (scroll) rows.current.get(keys[0])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    later(() => setAttention([]), ATTENTION_MS);
  }

  /** A locked module was tapped: it shakes, stays off, and what to turn on first lights up. */
  function explainLocked(key: ModuleKey) {
    const chain = modulesToTurnOnFirst(settings, key);
    setShaking(key);
    later(() => setShaking(null), 450);
    callAttention(chain);
    showToast(
      `Para ligar ${moduleDefinition(key).name}, ligue antes ${moduleNames(chain)}${chain.length > 1 ? ', nessa ordem' : ''}.`,
      'info',
    );
  }

  async function handleToggle(key: ModuleKey, next: boolean) {
    if (!next) {
      await turnOff(key);
      return;
    }
    const result = await turnOn(key);
    if (!result.ok) {
      explainLocked(key);
      return;
    }
    // The modules that hang from this one can be turned on now: show where they are.
    const unlocked = dependentsOf(key).filter(
      (dependent) => moduleDefinition(dependent).dependsOn.includes(key) && !modules[dependent],
    );
    if (unlocked.length > 0) callAttention(unlocked, false);
  }

  const nodeProps = {
    modules,
    busy,
    shaking,
    attention,
    registerRow: (key: ModuleKey, element: HTMLDivElement | null) => {
      if (element) rows.current.set(key, element);
      else rows.current.delete(key);
    },
    onToggle: (key: ModuleKey, next: boolean) => void handleToggle(key, next),
    onPointAt: (key: ModuleKey) => callAttention(modulesToTurnOnFirst(settings, key)),
  };

  return (
    <div className="flex flex-1 flex-col gap-5 pb-10">
      <PageHeader title="Módulos" subtitle="Escolha o que o seu Capital tem" backHref="/mais" />

      <p className="text-muted px-4 text-sm">
        Ligue só o que você usa: o que fica desligado some do rodapé, do Mais e do Início. Desligar não apaga
        nada. Alguns módulos precisam de outro para funcionar: eles ficam logo abaixo dele, com um cadeado,
        até você ligar o de cima.
      </p>

      {branches.map((root, index) => (
        <section
          key={root.key}
          className="flex flex-col gap-2 px-4"
          data-tour={index === 0 ? 'modulos-lista' : undefined}
        >
          <h2 className="text-muted px-1 text-xs font-semibold tracking-wide uppercase">
            {moduleDefinition(root.key).name} e o que depende dele
          </h2>
          <ul className="border-border bg-card rounded-2xl border p-2 shadow-sm">
            <ModuleNode node={root} {...nodeProps} />
          </ul>
        </section>
      ))}

      {standalone.length > 0 && (
        <section className="flex flex-col gap-2 px-4">
          <h2 className="text-muted px-1 text-xs font-semibold tracking-wide uppercase">
            Funcionam sozinhos
          </h2>
          <ul className="border-border bg-card divide-border divide-y rounded-2xl border p-2 shadow-sm">
            {standalone.map((node) => (
              <ModuleNode key={node.key} node={node} {...nodeProps} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface NodeProps {
  node: ModuleTreeNode;
  modules: ModuleFlags;
  busy: boolean;
  shaking: ModuleKey | null;
  attention: ModuleKey[];
  registerRow: (key: ModuleKey, element: HTMLDivElement | null) => void;
  onToggle: (key: ModuleKey, next: boolean) => void;
  /** Lights up (and scrolls to) what a locked module is waiting for. */
  onPointAt: (key: ModuleKey) => void;
}

function ModuleNode({ parentOn, ...props }: NodeProps & { parentOn?: boolean }) {
  const { node, modules } = props;

  return (
    <li
      // Under a parent, the branch line: grey while the parent is off (this module is locked),
      // green once it is on. The last child's line stops at its own row.
      className={
        parentOn === undefined
          ? undefined
          : `relative pl-3 before:absolute before:top-0 before:left-0 before:w-0.5 before:rounded-full after:absolute after:top-[30px] after:left-0 after:h-0.5 after:w-2.5 after:rounded-full last:before:h-[30px] [&:not(:last-child)]:before:h-full ${
              parentOn ? 'before:bg-primary/50 after:bg-primary/50' : 'before:bg-border after:bg-border'
            }`
      }
    >
      <ModuleRow {...props} />
      {node.children.length > 0 && (
        <ul className="ml-[18px]">
          {node.children.map((child) => (
            <ModuleNode key={child.key} {...props} node={child} parentOn={modules[node.key]} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ModuleRow({ node, modules, busy, shaking, attention, registerRow, onToggle, onPointAt }: NodeProps) {
  const { key } = node;
  const info = moduleDefinition(key);
  const visual = MODULE_VISUALS[key];
  const on = modules[key];
  const blockers = on ? [] : nearestMissing({ modules }, key);
  const locked = blockers.length > 0;

  return (
    <div
      ref={(element) => registerRow(key, element)}
      className={`flex gap-3 rounded-xl p-2.5 transition-colors ${
        shaking === key ? 'motion-safe:animate-shake' : ''
      } ${attention.includes(key) ? 'bg-primary/5 animate-attention' : ''}`}
    >
      <div className={`relative h-10 shrink-0 ${locked ? 'opacity-45 grayscale' : ''}`}>
        <IconTile icon={visual.icon} tone={visual.tone} />
        {locked && (
          <span
            aria-hidden
            className="bg-card border-border text-muted absolute -right-1.5 -bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full border"
          >
            <Lock className="h-3 w-3" strokeWidth={2.5} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-h-10 items-center justify-between gap-2">
          <p
            className={`min-w-0 text-sm leading-tight font-semibold ${locked ? 'text-muted' : 'text-foreground'}`}
          >
            {info.name}
          </p>
          {locked ? (
            <button
              type="button"
              role="switch"
              aria-checked={false}
              aria-disabled
              aria-label={`${info.name}: bloqueado, precisa de ${moduleNames(blockers)}`}
              onClick={() => onToggle(key, true)}
              className="bg-border/60 text-muted flex h-7 w-12 shrink-0 items-center justify-center rounded-full"
            >
              <Lock aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Switch
              checked={on}
              onChange={(next) => onToggle(key, next)}
              label={`${info.name}, ${on ? 'ligado' : 'desligado'}`}
              disabled={busy}
            />
          )}
        </div>
        <p className="text-muted text-xs">{info.description}</p>
        {locked && (
          <button
            type="button"
            onClick={() => onPointAt(key)}
            className="bg-background text-foreground border-border mt-2 inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-left text-xs font-medium"
          >
            <Lock aria-hidden className="text-muted h-3 w-3 shrink-0" />
            <span>
              Precisa de <strong className="font-semibold">{moduleNames(blockers)}</strong>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
