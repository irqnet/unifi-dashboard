/**
 * Demo-Daten für UNIFI_MOCK=true – ermöglicht Entwicklung und Präsentation
 * ohne erreichbaren Controller. Werte schwanken realistisch pro Poll.
 */
import type { RawClient, RawDevice, RawHealth, RawNetwork, RawPort, RawSite, SiteRawData } from './types';

export const MOCK_SITES: RawSite[] = [
  { name: 'default', desc: 'Hauptstandort' },
  { name: 'filiale', desc: 'Filiale Nord' },
];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const NETS: Omit<RawNetwork, '_id'>[] = [
  { name: 'LAN', purpose: 'corporate', vlan: undefined, ip_subnet: '192.168.1.1/24' },
  { name: 'Server', purpose: 'corporate', vlan: 30, vlan_enabled: true, ip_subnet: '10.0.30.1/24' },
  { name: 'Smart Home', purpose: 'corporate', vlan: 20, vlan_enabled: true, ip_subnet: '10.0.20.1/24' },
  { name: 'Kameras', purpose: 'corporate', vlan: 40, vlan_enabled: true, ip_subnet: '10.0.40.1/24' },
  { name: 'Gäste', purpose: 'guest', vlan: 10, vlan_enabled: true, ip_subnet: '10.0.10.1/24' },
  { name: 'Nachbarn', purpose: 'guest', vlan: 11, vlan_enabled: true, ip_subnet: '10.0.11.1/24' },
  { name: 'Management', purpose: 'corporate', vlan: 99, vlan_enabled: true, ip_subnet: '10.0.99.1/24' },
];

const HOSTS = [
  'macbook-pro', 'iphone-anna', 'pixel-8', 'nas-01', 'proxmox-1', 'proxmox-2', 'hue-bridge', 'shelly-plug-1',
  'shelly-plug-2', 'sonos-kueche', 'tv-wohnzimmer', 'cam-einfahrt', 'cam-garten', 'cam-haustuer', 'ipad',
  'thinkpad', 'printer', 'homeassistant', 'pihole', 'guest-phone-1', 'guest-laptop', 'neighbor-tv', 'switch-console',
  'esp32-sensor', 'tado-bridge', 'kindle', 'galaxy-tab', 'nuc-media', 'backup-srv', 'mqtt-broker',
];

const net = (i: number, site: string) => `${site}-net-${i}`;

function port(idx: number, rnd: () => number, opts: Partial<RawPort> = {}): RawPort {
  const up = rnd() > 0.25;
  const speeds = [100, 1000, 1000, 1000, 2500];
  const speed = up ? speeds[Math.floor(rnd() * speeds.length)] : 0;
  const poe = rnd() > 0.5;
  return {
    port_idx: idx,
    name: `Port ${idx}`,
    up,
    enable: true,
    speed,
    full_duplex: true,
    port_poe: true,
    poe_enable: poe && up,
    poe_mode: poe ? 'auto' : 'off',
    poe_power: poe && up ? (2 + rnd() * 10).toFixed(2) : '0.00',
    ...opts,
  };
}

export function mockSiteData(site: string, now = Date.now()): SiteRawData {
  const base = site === 'default' ? 1 : 7;
  const stable = seeded(base * 9973);
  const live = seeded(Math.floor(now / 1000) + base);
  const wave = (phase: number) => 0.6 + 0.4 * Math.sin(now / 45_000 + phase);

  const netList: RawNetwork[] = (site === 'default' ? NETS : NETS.slice(0, 4)).map((n, i) => ({ ...n, _id: net(i, site), enabled: true }));
  netList.push(
    {
      _id: `${site}-wan1`,
      name: 'Internet 1',
      purpose: 'wan',
      wan_networkgroup: 'WAN',
      enabled: true,
      wan_provider_capabilities: { download_kilobits_per_second: 1_000_000, upload_kilobits_per_second: 500_000 },
    },
    {
      _id: `${site}-wan2`,
      name: 'LTE Backup',
      purpose: 'wan',
      wan_networkgroup: 'WAN2',
      enabled: true,
      wan_provider_capabilities: { download_kilobits_per_second: 150_000, upload_kilobits_per_second: 50_000 },
    },
  );

  const devices: RawDevice[] = [];
  const gwMac = `aa:00:00:${base}0:00:01`;
  devices.push({
    _id: `${site}-gw`,
    mac: gwMac,
    name: site === 'default' ? 'Dream Machine Pro' : 'Cloud Gateway',
    model: 'UDMPRO',
    type: 'udm',
    ip: '192.168.1.1',
    version: '4.1.13',
    uptime: 1_234_567 + Math.floor(now / 1000) % 100000,
    state: 1,
    'system-stats': { cpu: (12 + live() * 20).toFixed(1), mem: (48 + live() * 8).toFixed(1) },
    uplink: { name: 'eth8', comment: 'WAN' },
    wan1: { ip: site === 'default' ? '203.0.113.42' : '198.51.100.7', up: true },
    wan2: { ip: '100.64.12.9', up: true },
  });

  const switches = site === 'default' ? 2 : 1;
  for (let s = 0; s < switches; s++) {
    const nPorts = s === 0 ? 24 : 8;
    const ports: RawPort[] = [];
    for (let p = 1; p <= nPorts; p++) ports.push(port(p, stable));
    if (s === 0) {
      ports.push({ port_idx: 25, name: 'SFP+ 1', up: true, enable: true, speed: 10000, media: 'SFP+', is_uplink: true, sfp_found: true });
      ports.push({ port_idx: 26, name: 'SFP+ 2', up: false, enable: true, speed: 0, media: 'SFP+' });
      ports[0].is_uplink = false;
    } else {
      ports[nPorts - 1].is_uplink = true;
      ports[nPorts - 1].speed = 1000;
      ports[nPorts - 1].up = true;
    }
    for (const p of ports) {
      if (p.up) {
        p['rx_bytes-r'] = Math.floor(live() * 4_000_000);
        p['tx_bytes-r'] = Math.floor(live() * 8_000_000);
      }
    }
    devices.push({
      _id: `${site}-sw-${s}`,
      mac: `aa:00:00:${base}1:00:0${s}`,
      name: s === 0 ? 'Core Switch' : 'Switch Büro',
      model: s === 0 ? 'USW-Pro-24-PoE' : 'USW-Lite-8-PoE',
      type: 'usw',
      ip: `192.168.1.${2 + s}`,
      version: '7.1.26',
      uptime: 864_000 + s * 3600,
      state: s === 1 && site === 'filiale' ? 0 : 1,
      general_temperature: 38 + live() * 12,
      has_temperature: true,
      total_max_power: s === 0 ? 400 : 52,
      port_table: ports,
    });
  }

  const aps = site === 'default' ? ['AP Erdgeschoss', 'AP Obergeschoss', 'AP Garten'] : ['AP Filiale'];
  aps.forEach((name, a) => {
    const radios = [
      { name: 'wifi0', radio: 'ng', channel: [1, 6, 11][a % 3], cu_total: Math.floor(20 + live() * 50), num_sta: Math.floor(live() * 8) },
      { name: 'wifi1', radio: 'na', channel: [36, 52, 100][a % 3], cu_total: Math.floor(5 + live() * 40), num_sta: Math.floor(live() * 14) },
    ];
    if (a === 0) radios.push({ name: 'wifi2', radio: '6e', channel: 37, cu_total: Math.floor(live() * 15), num_sta: Math.floor(live() * 3) });
    devices.push({
      _id: `${site}-ap-${a}`,
      mac: `aa:00:00:${base}2:00:0${a}`,
      name,
      model: a === 0 ? 'U7-Pro' : 'U6-LR',
      type: 'uap',
      ip: `192.168.1.${10 + a}`,
      version: '6.6.77',
      uptime: 500_000 + a * 7200,
      state: 1,
      radio_table_stats: radios,
      num_sta: radios.reduce((s, r) => s + r.num_sta, 0),
      'tx_bytes-r': Math.floor(wave(a) * live() * 6_000_000),
      'rx_bytes-r': Math.floor(wave(a) * live() * 1_500_000),
    });
  });

  const clients: RawClient[] = [];
  const nClients = site === 'default' ? 30 : 9;
  for (let i = 0; i < nClients; i++) {
    const n = Math.floor(stable() * netList.length);
    const nw = netList[n];
    const wired = stable() > 0.55;
    const subnet = (nw.ip_subnet ?? '').split('.').slice(0, 3).join('.');
    const heavy = stable() > 0.8 ? 20 : 1;
    const down = Math.floor(wave(i) * live() * 400_000 * heavy);
    const up = Math.floor(wave(i + 1) * live() * 80_000 * heavy);
    const ap = devices.filter((d) => d.type === 'uap')[i % aps.length];
    const sw = devices.find((d) => d.type === 'usw');
    clients.push({
      mac: `de:ad:be:ef:${base.toString(16).padStart(2, '0')}:${i.toString(16).padStart(2, '0')}`,
      hostname: HOSTS[i % HOSTS.length],
      ip: `${subnet}.${20 + i}`,
      is_wired: wired,
      is_guest: nw.purpose === 'guest',
      network_id: nw._id,
      network: nw.name,
      ap_mac: wired ? undefined : ap?.mac,
      sw_mac: wired ? sw?.mac : undefined,
      uptime: 3600 * (1 + i),
      ...(wired
        ? { 'wired-rx_bytes-r': up, 'wired-tx_bytes-r': down }
        : { 'rx_bytes-r': up, 'tx_bytes-r': down }),
    });
  }

  const totalDown = clients.reduce((s, c) => s + (c['tx_bytes-r'] ?? c['wired-tx_bytes-r'] ?? 0), 0);
  const totalUp = clients.reduce((s, c) => s + (c['rx_bytes-r'] ?? c['wired-rx_bytes-r'] ?? 0), 0);
  const health: RawHealth[] = [
    {
      subsystem: 'wan',
      status: 'ok',
      wan_ip: site === 'default' ? '203.0.113.42' : '198.51.100.7',
      isp_name: 'Deutsche Glasfaser',
      gw_mac: gwMac,
      'gw_system-stats': devices[0]['system-stats'],
      'rx_bytes-r': totalDown,
      'tx_bytes-r': totalUp,
    },
    {
      subsystem: 'www',
      status: 'ok',
      latency: Math.floor(8 + live() * 10),
      xput_down: 942.3,
      xput_up: 487.1,
      speedtest_ping: 9,
    },
    { subsystem: 'lan', status: 'ok', num_user: clients.filter((c) => c.is_wired).length },
    { subsystem: 'wlan', status: 'ok', num_user: clients.filter((c) => !c.is_wired).length },
  ];
  if (site === 'filiale') health[2].status = 'warning';

  return { devices, clients, networks: netList, health };
}
