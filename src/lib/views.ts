/** Normalised data types delivered to the frontend (client & server). */

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
  mac: string;
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
  mac: string;
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
  down: number; // current throughput bit/s
  up: number;
  history: TrafficPoint[];
  /** Capacity for the utilisation display in bit/s and its source */
  capacityDown: number | null;
  capacityUp: number | null;
  capacitySource: 'isp' | 'config' | 'speedtest' | 'peak' | null;
  /** Active WAN connection (name from UniFi, e.g. "Internet 1") */
  activeWan: string | null;
  /** Expected ISP speeds of the active WAN in bit/s */
  expectedDown: number | null;
  expectedUp: number | null;
}

/** A single WAN connection (with multi-WAN one tile per provider) */
export interface WanLinkView extends WanView {
  /** WAN group from UniFi: WAN, WAN2 … */
  key: string;
  /** Network name from UniFi, e.g. "Internet 1" */
  name: string;
  /** Currently carries the traffic (leading WAN according to the gateway) */
  isActive: boolean;
  /** Multi-WAN mode from the UniFi configuration, null if unknown */
  mode: 'failover' | 'loadbalance' | null;
  /** Display state: active, standby (failover reserve) or offline */
  role: 'active' | 'standby' | 'offline';
  /** Load-balancing share in percent */
  weight: number | null;
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
  /** WAN connections individually (one entry with a single provider) */
  wans: WanLinkView[];
  gateway: GatewayView;
  totals: ClientCounts & { down: number; up: number };
  groups: GroupView[];
  networks: Record<string, NetworkView>;
  /** Network IDs without a group (only if enabled in the admin area) */
  ungrouped: string[];
  switches: SwitchView[];
  aps: ApView[];
  /** Device groups in admin order (hidden groups are not included) */
  deviceGroups: DeviceGroupView[];
  /** IDs of ungrouped switches/APs (empty if hidden in the admin area) */
  ungroupedSwitches: string[];
  ungroupedAps: string[];
  /** Set when the response is restricted to a status page */
  statusPage?: StatusPageInfo;
}

export interface StatusPageInfo {
  slug: string;
  title: string;
  description: string;
  showWan: boolean;
  isPublic: boolean;
  /** Viewer is signed in (otherwise public view without login) */
  loggedIn: boolean;
  /** All status pages the viewer may see (navigation) */
  pages: { slug: string; title: string }[];
}

export interface DeviceGroupView {
  id: string;
  name: string;
  description: string;
  color: string;
  switchIds: string[];
  apIds: string[];
}

export interface AdminDevice {
  mac: string;
  name: string;
  model: string;
  type: 'switch' | 'ap';
  ip: string | null;
  online: boolean;
  groupId: number | null;
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

/**
 * Masked error code for status pages (the real controller error stays on the server);
 * the UI shows a translated message for it.
 */
export const CONTROLLER_ERROR = 'controller_unreachable';
