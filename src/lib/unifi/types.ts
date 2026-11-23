/** Raw data types of the UniFi Network API (only the fields in use). */

export interface UniFiEnvelope<T> {
  meta: { rc: 'ok' | 'error'; msg?: string };
  data: T[];
}

export interface RawSite {
  _id?: string;
  name: string;
  desc?: string;
}

export interface RawPort {
  port_idx: number;
  name?: string;
  up?: boolean;
  enable?: boolean;
  speed?: number;
  full_duplex?: boolean;
  media?: string;
  is_uplink?: boolean;
  port_poe?: boolean;
  poe_enable?: boolean;
  poe_mode?: string;
  poe_power?: string | number;
  poe_class?: string;
  sfp_found?: boolean;
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
}

export interface RawRadioStats {
  name?: string;
  radio?: string;
  channel?: number;
  cu_total?: number;
  num_sta?: number;
  tx_power?: number;
  satisfaction?: number;
}

export interface RawRadio {
  name?: string;
  radio?: string;
  channel?: number | string;
  ht?: number | string;
}

export interface RawDevice {
  _id: string;
  mac: string;
  name?: string;
  model?: string;
  model_name?: string;
  shortname?: string;
  type: string; // usw | uap | ugw | udm | uxg
  ip?: string;
  version?: string;
  uptime?: number;
  state?: number; // 1 = connected
  adopted?: boolean;
  num_sta?: number;
  'user-num_sta'?: number;
  'guest-num_sta'?: number;
  general_temperature?: number;
  temperatures?: { name: string; type?: string; value: number }[];
  has_temperature?: boolean;
  overheating?: boolean;
  total_max_power?: number;
  'total_used_power'?: number;
  poe_budget?: number;
  port_table?: RawPort[];
  radio_table?: RawRadio[];
  radio_table_stats?: RawRadioStats[];
  'system-stats'?: { cpu?: string | number; mem?: string | number; uptime?: string | number };
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
  'bytes-r'?: number;
  uplink?: { 'rx_bytes-r'?: number; 'tx_bytes-r'?: number; speed?: number; type?: string; name?: string; comment?: string; ip?: string };
  wan1?: RawWanPort;
  wan2?: RawWanPort;
  wan3?: RawWanPort;
  /** Per-WAN geo lookup of the public IP (UniFi OS gateways), keyed by WAN, WAN2 … */
  geo_info?: Record<string, { isp_name?: string; isp_organization?: string } | undefined>;
}

/** WAN connection on the gateway (stat/device: wan1, wan2 …) */
export interface RawWanPort {
  ip?: string;
  up?: boolean;
  name?: string;
  ifname?: string;
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
}

export interface RawClient {
  _id?: string;
  mac: string;
  hostname?: string;
  name?: string;
  ip?: string;
  is_wired?: boolean;
  is_guest?: boolean;
  network_id?: string;
  network?: string;
  vlan?: number;
  ap_mac?: string;
  sw_mac?: string;
  essid?: string;
  radio?: string;
  signal?: number;
  uptime?: number;
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
  'wired-rx_bytes-r'?: number;
  'wired-tx_bytes-r'?: number;
}

export interface RawNetwork {
  _id: string;
  name: string;
  purpose?: string; // corporate | guest | wan | vlan-only | remote-user-vpn | site-vpn
  vlan?: number | string;
  vlan_enabled?: boolean;
  ip_subnet?: string;
  enabled?: boolean;
  networkgroup?: string;
  /** WAN networks: WAN, WAN2, … */
  wan_networkgroup?: string;
  /** Multi-WAN: failover-only or weighted (load balancing) */
  wan_load_balance_type?: string;
  /** Load-balancing weight (1–99) */
  wan_load_balance_weight?: number;
  /** "Expected ISP Speeds" from the WAN settings */
  wan_provider_capabilities?: { download_kilobits_per_second?: number; upload_kilobits_per_second?: number };
}

export interface RawHealth {
  subsystem: string; // wan | www | lan | wlan | vpn
  status?: string; // ok | warning | error | unknown
  wan_ip?: string;
  isp_name?: string;
  gw_name?: string;
  gw_mac?: string;
  'gw_system-stats'?: { cpu?: string | number; mem?: string | number; uptime?: string | number };
  latency?: number;
  xput_up?: number;
  xput_down?: number;
  speedtest_ping?: number;
  speedtest_lastrun?: number;
  uptime?: number;
  num_user?: number;
  num_guest?: number;
  num_ap?: number;
  num_sw?: number;
  num_adopted?: number;
  num_disconnected?: number;
  'rx_bytes-r'?: number;
  'tx_bytes-r'?: number;
}

export interface SiteRawData {
  devices: RawDevice[];
  clients: RawClient[];
  networks: RawNetwork[];
  health: RawHealth[];
  /** Speedtest results (UniFi Network v2 API); newer firmware no longer fills xput_* in stat/health. */
  speedtests?: RawSpeedtest[];
}

/** Entry from v2/api/site/{site}/speedtest */
export interface RawSpeedtest {
  download_mbps?: number;
  upload_mbps?: number;
  latency_ms?: number;
  time?: number;
  interface_name?: string;
  wan_networkgroup?: string;
}

/** Hotspot voucher from stat/voucher (classic Network API). */
export interface RawVoucher {
  _id: string;
  code: string;
  create_time: number;
  /** Validity in minutes from first use */
  duration: number;
  /** 0 = unlimited uses, 1 = single use, n = n devices */
  quota: number;
  used?: number;
  note?: string | null;
  status?: string;
  status_expires?: number;
  start_time?: number;
  end_time?: number;
  qos_overwrite?: boolean;
  qos_rate_max_up?: number;
  qos_rate_max_down?: number;
  qos_usage_quota?: number;
  admin_name?: string;
  for_hotspot?: boolean;
}

/** Guest session from stat/guest (for mapping voucher → devices). */
export interface RawGuest {
  _id?: string;
  mac: string;
  hostname?: string;
  name?: string;
  voucher_code?: string;
  voucher_id?: string;
  start?: number;
  end?: number;
  expired?: boolean;
  authorized_by?: string;
  rx_bytes?: number;
  tx_bytes?: number;
}
