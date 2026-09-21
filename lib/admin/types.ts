/** What the Administração screen shows. Only the server's owner (OWNER_EMAIL) ever gets it. */

export interface LoadGuardConfig {
  /** Average requests per second that raise a warning. */
  alertRps: number;
  /** Average requests per second that pause the server. */
  shedRps: number;
  /** How long a pause lasts, extended while the flood goes on. */
  shedSeconds: number;
  /** Requests one IP may make in a minute. */
  ipPerMinute: number;
  /** Requests one IP may make in 10 seconds: keeps a single address from ever pausing the server. */
  ipPer10s: number;
  /** Board temperature (°C) that raises a warning. */
  tempAlertC: number;
  /** Board temperature (°C) that pauses the server. */
  tempShedC: number;
}

export type GuardEventKind = 'rps-alert' | 'shed-start' | 'shed-end' | 'ip-blocked' | 'temp-alert';

export interface GuardEvent {
  /** Epoch milliseconds. */
  at: number;
  kind: GuardEventKind;
  message: string;
}

/** The load guard right now (times in epoch milliseconds). */
export interface ServerStatus {
  rps: number;
  peakRps: number;
  peakAt: number | null;
  temperatureC: number | null;
  temperatureAt: number | null;
  shedding: boolean;
  shedUntil: number | null;
  shedReason: 'rps' | 'temperature' | null;
  totals: { allowed: number; ipBlocked: number; shed: number };
  /** When the counting started (the server's last start). */
  since: number;
  events: GuardEvent[];
  config: LoadGuardConfig;
}

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  emailVerified: boolean;
  /** May turn on the VIP-only modules (always true for the owner). */
  vip: boolean;
  owner: boolean;
  /** Last time one of the account's open sessions was used; null when none is open (signing out ends it). */
  lastSeenAt: string | null;
}

export interface AdminOverview {
  status: ServerStatus;
  users: AdminUser[];
}
