/** Rohdaten-Typen der UniFi Network API (nur die genutzten Felder). */

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
  state?: number; // 1 = verbunden
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
  uplink?: { 'rx_bytes-r'?: number; 'tx_bytes-r'?: number; speed?: number; type?: string };
  wan1?: { ip?: string; up?: boolean };
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
}
