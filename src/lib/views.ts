/** Normalisierte, an das Frontend gelieferte Datentypen (Client & Server). */

export type SystemStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export interface TrafficPoint {
  t: number;
  down: number; // bit/s
  up: number; // bit/s
  clients: number;
}

export interface ClientCounts {
  total: number;
  wired: number;
  wireless: number;
}

export interface ClientRow {
  key: string;
  name: string;
  ip: string | null;
  mac: string | null;
  wired: boolean;
  down: number;
  up: number;
  via: string | null;
  networkId: string;
}

export interface NetworkView {
  id: string;
  name: string;
  vlan: number | null;
  subnet: string | null;
  purpose: string;
  anonymized: boolean;
  clients: ClientCounts;
  down: number;
  up: number;
  history: TrafficPoint[];
  topClients: ClientRow[];
}

export interface GroupView {
  id: string;
  name: string;
  description: string;
  color: string;
  displayMode: 'consolidated' | 'expanded';
  anonymized: boolean;
  networkIds: string[];
  clients: ClientCounts;
  down: number;
  up: number;
  history: TrafficPoint[];
  topClients: ClientRow[];
}

export interface PortView {
  idx: number;
  name: string;
  up: boolean;
  enabled: boolean;
  speed: number; // Mbit/s
  media: string | null;
  uplink: boolean;
  poe: boolean;
  poeCapable: boolean;
  poePower: number; // W
  down: number;
  up_: number;
}

export interface SwitchView {
  id: string;
  name: string;
  model: string;
  ip: string | null;
  version: string | null;
  uptime: number | null;
  online: boolean;
  temperature: number | null;
  overheating: boolean;
  poeUsed: number | null;
  poeBudget: number | null;
  clients: number;
  ports: PortView[];
}

export interface RadioView {
  band: '2.4' | '5' | '6' | '?';
  channel: number | null;
  utilization: number | null;
  clients: number;
}

export interface ApView {
  id: string;
  name: string;
  model: string;
  ip: string | null;
  version: string | null;
  uptime: number | null;
  online: boolean;
  clients: number;
  radios: RadioView[];
  down: number;
  up: number;
}

export interface WanView {
  status: SystemStatus;
  ip: string | null;
  isp: string | null;
  latency: number | null;
  xputDown: number | null; // Mbit/s (Speedtest)
  xputUp: number | null;
  down: number; // aktueller Durchsatz bit/s
  up: number;
  history: TrafficPoint[];
}

export interface GatewayView {
  name: string | null;
  model: string | null;
  cpu: number | null;
  mem: number | null;
  uptime: number | null;
}

export interface SiteInfo {
  name: string;
  desc: string;
}

export interface DashboardPayload {
  site: string;
  sites: SiteInfo[];
  generatedAt: number;
  lastPoll: number | null;
  error: string | null;
  pollingIntervalMs: number;
  isAdmin: boolean;
  status: SystemStatus;
  wan: WanView;
  gateway: GatewayView;
  totals: ClientCounts & { down: number; up: number };
  groups: GroupView[];
  networks: Record<string, NetworkView>;
  /** Netzwerk-IDs ohne Gruppe (nur wenn im Admin-Bereich freigegeben) */
  ungrouped: string[];
  switches: SwitchView[];
  aps: ApView[];
}

export interface AdminNetwork {
  id: string;
  name: string;
  vlan: number | null;
  subnet: string | null;
  purpose: string;
  enabled: boolean;
  hidden: boolean;
  anonymizeClients: boolean;
  groupId: number | null;
}
