'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Ban,
  CheckCircle2,
  EyeOff,
  KeyRound,
  PauseCircle,
  Search,
  Server,
  Thermometer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AdminModule, AdminOverview, AdminUser, GuardEventKind, ServerStatus } from '@/lib/admin/types';
import type { ModuleKey } from '@/lib/budget';
import { moduleDefinition, moduleNames } from '@/lib/modules';
import { adminRepository } from '@/lib/storage/admin';
import { toStorageErrorMessage } from '@/lib/storage/errors';
import { PageHeader } from '@/components/layout/PageHeader';
import { useHomeHref } from '@/components/modules/useHomeHref';
import { MODULE_VISUALS } from '@/components/modules/visuals';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

const REFRESH_MS = 5000;
const EVENTS_SHOWN = 8;

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** "14:32" today, "16/09 14:32" on another day. */
function formatMoment(at: number, now: number): string {
  const date = new Date(at);
  const sameDay = new Date(now).toDateString() === date.toDateString();
  return sameDay
    ? timeFormatter.format(date)
    : `${shortDateFormatter.format(date)} ${timeFormatter.format(date)}`;
}

/** "agora há pouco", "há 5 min", "há 3 h", "há 2 dias", or the date. */
function formatAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return 'agora há pouco';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  return `em ${dateFormatter.format(new Date(iso))}`;
}

type Level = 'ok' | 'alert' | 'paused';

function levelOf(status: ServerStatus): Level {
  if (status.shedding) return 'paused';
  const hot = status.temperatureC !== null && status.temperatureC >= status.config.tempAlertC;
  return hot || status.rps >= status.config.alertRps ? 'alert' : 'ok';
}

const EVENT_VISUALS: Record<GuardEventKind, { icon: LucideIcon; tone: IconTone }> = {
  'rps-alert': { icon: Activity, tone: 'amber' },
  'shed-start': { icon: PauseCircle, tone: 'red' },
  'shed-end': { icon: CheckCircle2, tone: 'green' },
  'ip-blocked': { icon: Ban, tone: 'red' },
  'temp-alert': { icon: Thermometer, tone: 'amber' },
};

function Card({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: IconTone;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-card mx-4 flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <IconTile icon={icon} tone={tone} size="sm" />
        <h2 className="text-foreground font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** "1 conta sem acesso", "3 contas sem acesso" (to the restricted modules). */
function accountsWithoutVip(count: number): string {
  return count === 1 ? '1 conta sem acesso' : `${count} contas sem acesso`;
}

/**
 * Administração, only for whoever runs the server (OWNER_EMAIL): how the board is doing right now
 * (requests per second, temperature, pauses), the recent warnings, which modules are restricted
 * ("Restrito", one switch per module: hidden from every account without access) and every account
 * with the switch that gives it access. (In the code and the database the access is still "vip".)
 */
export function AdminScreen() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const homeHref = useHomeHref();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [showAllEvents, setShowAllEvents] = useState(false);
  /** The account whose access switch is being saved: a refresh meanwhile keeps its local value. */
  const saving = useRef<string | null>(null);
  /** The same for the module whose "Restrito" is being saved. */
  const savingModule = useRef<ModuleKey | null>(null);
  const [busyModule, setBusyModule] = useState<ModuleKey | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await adminRepository.overview();
      setOverview((previous) => {
        if (!previous) return next;
        const local = previous.users.find((item) => item.id === saving.current);
        const localModule = previous.modules.find((item) => item.key === savingModule.current);
        return {
          ...next,
          users: next.users.map((item) => (local && item.id === local.id ? local : item)),
          modules: next.modules.map((item) =>
            localModule && item.key === localModule.key ? localModule : item,
          ),
        };
      });
      setError(null);
    } catch (err) {
      setError(toStorageErrorMessage(err, 'Não foi possível atualizar agora.'));
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function toggleVip(target: AdminUser, vip: boolean) {
    const apply = (value: boolean) =>
      setOverview(
        (previous) =>
          previous && {
            ...previous,
            users: previous.users.map((item) => (item.id === target.id ? { ...item, vip: value } : item)),
          },
      );
    saving.current = target.id;
    apply(vip);
    try {
      await adminRepository.setVip(target.id, vip);
      showToast(
        vip
          ? `${target.email} agora vê os módulos restritos.`
          : `${target.email} não vê mais os módulos restritos. Nenhum dado foi apagado.`,
        'success',
      );
    } catch (err) {
      apply(!vip);
      showToast(toStorageErrorMessage(err, 'Não foi possível salvar. Tente de novo.'), 'error');
    } finally {
      saving.current = null;
    }
  }

  async function toggleModuleVip(target: AdminModule, vipOnly: boolean) {
    const name = moduleDefinition(target.key).name;
    const using = target.usersWithoutVip;
    if (vipOnly && using > 0) {
      const confirmed = await confirm({
        title: `Restringir ${name}?`,
        message: `Ele some para ${accountsWithoutVip(using)}, sem apagar nenhum dado.`,
        confirmLabel: 'Restringir',
        cancelLabel: 'Agora não',
      });
      if (!confirmed) return;
    }
    const apply = (value: boolean) =>
      setOverview(
        (previous) =>
          previous && {
            ...previous,
            modules: previous.modules.map((item) =>
              item.key === target.key ? { ...item, vipOnly: value } : item,
            ),
          },
      );
    savingModule.current = target.key;
    setBusyModule(target.key);
    apply(vipOnly);
    try {
      const { turnedOff } = await adminRepository.setModuleVip(target.key, vipOnly);
      showToast(
        vipOnly
          ? `${name} agora é restrito.${turnedOff > 0 ? ` Sumiu para ${accountsWithoutVip(turnedOff)}.` : ''}`
          : `${name} liberado para todas as contas.`,
        'success',
      );
      // The owner's own screens read the new choice too.
      router.refresh();
    } catch (err) {
      apply(!vipOnly);
      showToast(toStorageErrorMessage(err, 'Não foi possível salvar. Tente de novo.'), 'error');
    } finally {
      savingModule.current = null;
      setBusyModule(null);
    }
    void load();
  }

  const users = useMemo(() => {
    const list = overview?.users ?? [];
    const term = query.trim().toLowerCase();
    return term ? list.filter((item) => item.email.toLowerCase().includes(term)) : list;
  }, [overview, query]);

  const header = <PageHeader title="Administração" subtitle="Só você vê esta tela" backHref={homeHref} />;

  if (!overview) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-10">
        {header}
        {error ? (
          <p className="bg-danger-bg text-danger mx-4 rounded-lg px-3 py-2 text-sm">{error}</p>
        ) : (
          <div className="text-muted flex flex-1 items-center justify-center px-4 py-16">Carregando…</div>
        )}
      </div>
    );
  }

  const { status } = overview;
  const level = levelOf(status);
  const vipCount = overview.users.filter((item) => item.vip).length;
  const vipModules = overview.modules.filter((item) => item.vipOnly).map((item) => item.key);
  const events = showAllEvents ? status.events : status.events.slice(0, EVENTS_SHOWN);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-10">
      {header}

      {error && (
        <p className="bg-warning-bg text-warning mx-4 rounded-lg px-3 py-2 text-sm">
          {error} Mostrando os últimos números recebidos.
        </p>
      )}

      <Card title="Servidor agora" icon={Server} tone="amber">
        <StatusBanner level={level} status={status} now={now} />

        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="Requisições/s"
            value={formatNumber(status.rps, 1)}
            hint={`aviso ${status.config.alertRps} · pausa ${status.config.shedRps}`}
            warn={status.rps >= status.config.alertRps}
          />
          <Stat
            label="Temperatura"
            value={status.temperatureC === null ? '—' : `${formatNumber(status.temperatureC)} °C`}
            hint={
              status.temperatureC === null
                ? 'sem sensor aqui'
                : `aviso ${status.config.tempAlertC} · pausa ${status.config.tempShedC}`
            }
            warn={status.temperatureC !== null && status.temperatureC >= status.config.tempAlertC}
          />
          <Stat
            label="Pico"
            value={formatNumber(status.peakRps, 1)}
            hint={status.peakAt ? `às ${formatMoment(status.peakAt, now)}` : 'nenhum ainda'}
          />
        </div>

        <p className="text-muted text-xs">
          Desde {formatMoment(status.since, now)}: {formatNumber(status.totals.allowed)} atendidas ·{' '}
          {formatNumber(status.totals.ipBlocked)} barradas por IP · {formatNumber(status.totals.shed)} durante
          pausas. Um IP pode fazer até {formatNumber(status.config.ipPer10s)} requisições em 10 segundos e{' '}
          {formatNumber(status.config.ipPerMinute)} por minuto; os limites ficam no <code>.env.local</code> do
          servidor.
        </p>
      </Card>

      <Card title="Alertas recentes" icon={Activity} tone="red">
        {status.events.length === 0 ? (
          <p className="text-muted text-sm">Nenhum alerta desde que o servidor ligou.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event) => {
              const visual = EVENT_VISUALS[event.kind];
              return (
                <li key={`${event.at}-${event.kind}-${event.message}`} className="flex gap-3">
                  <IconTile icon={visual.icon} tone={visual.tone} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm">{event.message}</p>
                    <p className="text-muted text-xs">{formatMoment(event.at, now)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {status.events.length > EVENTS_SHOWN && (
          <button
            type="button"
            onClick={() => setShowAllEvents((value) => !value)}
            className="text-accent min-h-[36px] self-start text-sm font-medium"
          >
            {showAllEvents ? 'Mostrar menos' : `Ver todos (${status.events.length})`}
          </button>
        )}
      </Card>

      <Card title="Módulos restritos" icon={EyeOff} tone="purple">
        <p className="text-muted text-sm">
          Some para quem não tem acesso, sem apagar dados.
        </p>
        <ul className="divide-border -mx-1 flex flex-col divide-y">
          {overview.modules.map((item) => (
            <ModuleRow
              key={item.key}
              item={item}
              busy={busyModule === item.key}
              onToggle={(vipOnly) => void toggleModuleVip(item, vipOnly)}
            />
          ))}
        </ul>
      </Card>

      <Card title={`Contas (${overview.users.length})`} icon={Users} tone="blue">
        <p className="text-muted text-sm">
          {vipModules.length > 0
            ? `O acesso libera os módulos restritos: hoje, ${moduleNames(vipModules)}.`
            : 'Nenhum módulo está restrito agora.'}{' '}
          {vipCount} {vipCount === 1 ? 'conta tem acesso' : 'contas têm acesso'}, contando a sua.
        </p>

        {overview.users.length > 5 && (
          <label className="border-border bg-background flex min-h-[44px] items-center gap-2 rounded-lg border px-3">
            <Search aria-hidden className="text-muted h-4 w-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por e-mail"
              aria-label="Buscar conta por e-mail"
              className="text-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}

        {users.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma conta com esse e-mail.</p>
        ) : (
          <ul className="divide-border -mx-1 flex flex-col divide-y">
            {users.map((account) => (
              <UserRow
                key={account.id}
                account={account}
                now={now}
                onToggle={(vip) => void toggleVip(account, vip)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatusBanner({ level, status, now }: { level: Level; status: ServerStatus; now: number }) {
  if (level === 'paused') {
    const why =
      status.shedReason === 'temperature' ? 'a placa esquentou demais' : 'acessos demais de uma vez';
    return (
      <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-sm font-medium">
        Pausado até {status.shedUntil ? formatMoment(status.shedUntil, now) : 'em instantes'}: {why}. Quem
        acessa agora vê &quot;volte em instantes&quot;.
      </p>
    );
  }
  if (level === 'alert') {
    return (
      <p className="bg-warning-bg text-warning rounded-lg px-3 py-2 text-sm font-medium">
        Em alerta: acima do aviso. Passou do limite, pausa sozinho.
      </p>
    );
  }
  return (
    <p className="bg-success-bg text-success rounded-lg px-3 py-2 text-sm font-medium">
      Tudo normal. Atualiza a cada {REFRESH_MS / 1000} segundos.
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
  warn = false,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-background flex min-w-0 flex-col gap-0.5 rounded-xl px-2.5 py-2">
      <span className="text-muted truncate text-[11px] font-medium">{label}</span>
      <span
        className={`text-lg leading-tight font-semibold tabular-nums ${warn ? 'text-warning' : 'text-foreground'}`}
      >
        {value}
      </span>
      <span className="text-muted text-[11px] leading-tight">{hint}</span>
    </div>
  );
}

function ModuleRow({
  item,
  busy,
  onToggle,
}: {
  item: AdminModule;
  busy: boolean;
  onToggle: (vipOnly: boolean) => void;
}) {
  const info = moduleDefinition(item.key);
  const visual = MODULE_VISUALS[item.key];
  const using = item.usersWithoutVip;
  return (
    <li className="flex items-center gap-3 px-1 py-3">
      <IconTile icon={visual.icon} tone={visual.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-medium">{info.name}</p>
        <p className="text-muted text-xs">
          {item.vipOnly
            ? 'Só as contas com acesso'
            : using > 0
              ? `Todas as contas · ${accountsWithoutVip(using)} ${using === 1 ? 'usa' : 'usam'}`
              : 'Todas as contas'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Switch checked={item.vipOnly} onChange={onToggle} label={`Restrito: ${info.name}`} disabled={busy} />
        <span aria-hidden className="text-muted text-[10px] leading-none font-medium">
          Restrito
        </span>
      </div>
    </li>
  );
}

function UserRow({
  account,
  now,
  onToggle,
}: {
  account: AdminUser;
  now: number;
  onToggle: (vip: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-medium break-all">{account.email}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {account.owner && (
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold">
              Você · dono
            </span>
          )}
          {account.vip && !account.owner && (
            <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
              <KeyRound aria-hidden className="h-3 w-3" />
              Acesso aos restritos
            </span>
          )}
          {!account.emailVerified && (
            <span className="bg-warning-bg text-warning rounded-full px-2 py-0.5 text-[11px] font-semibold">
              E-mail não confirmado
            </span>
          )}
        </div>
        <p className="text-muted mt-1 text-xs">
          Criada em {dateFormatter.format(new Date(account.createdAt))} ·{' '}
          {account.lastSeenAt
            ? `último acesso ${formatAgo(account.lastSeenAt, now)}`
            : 'nenhuma sessão aberta'}
        </p>
      </div>
      <Switch
        checked={account.vip}
        onChange={onToggle}
        label={
          account.owner
            ? 'Sua conta sempre tem acesso aos restritos'
            : `Acesso aos restritos para ${account.email}`
        }
        disabled={account.owner}
      />
    </li>
  );
}
