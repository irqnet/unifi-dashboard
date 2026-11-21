/**
 * Builds the dashboard response from poller state + admin configuration (SQLite):
 * group aggregation, history data, privacy (anonymisation / hiding / masking).
 */
import 'server-only';
import { getConfig } from '../env';
import { getSettings, listDeviceGroups, listGroups, listNetworkSettings, type StatusPage } from '../db';
import type {
  AdminDevice,
  AdminNetwork,
  DeviceGroupView,
  ApView,
  ClientCounts,
  ClientRow,
  DashboardPayload,
  GatewayView,
  GroupView,
  NetworkView,
  PortView,
  RadioView,
  SwitchView,
  SystemStatus,
  TrafficPoint,
  WanLinkView,
  WanView,
} from '../views';
import { CONTROLLER_ERROR } from '../views';
import { clientRates, getPoller, type Sample } from './poller';
import type { RawDevice, RawNetwork } from './types';

const EMPTY_WAN: WanView = {
  status: 'unknown',
  ip: null,
  isp: null,
  latency: null,
  xputDown: null,
  xputUp: null,
  down: 0,
  up: 0,
  history: [],
  capacityDown: null,
  capacityUp: null,
  capacitySource: null,
  activeWan: null,
  expectedDown: null,
  expectedUp: null,
};
const EMPTY_GATEWAY: GatewayView = { name: null, model: null, cpu: null, mem: null, uptime: null };

const EXCLUDED_PURPOSES = new Set(['wan', 'remote-user-vpn', 'site-vpn', 'vpn-client', 'vpn-server']);
const TOP_CLIENTS = 10;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const p = ip.split('.');
  if (p.length === 4) return `${p[0]}.${p[1]}.×××.×××`;
  const v6 = ip.split(':');
  return v6.length > 2 ? `${v6[0]}:${v6[1]}:××××::` : '×××';
}

export function maskMac(mac: string | null | undefined): string | null {
  if (!mac) return null;
  const p = mac.split(':');
  return p.length === 6 ? `${p[0]}:${p[1]}:${p[2]}:××:××:××` : '××:××:××:××:××:××';
}

function vlanOf(n: RawNetwork): number | null {
  if (n.vlan_enabled === false) return null;
  const v = num(n.vlan);
  return v && v > 0 ? v : null;
}

export function relevantNetworks(networks: RawNetwork[]): RawNetwork[] {
  return networks
    .filter((n) => !EXCLUDED_PURPOSES.has(n.purpose ?? '') && n.enabled !== false)
    .sort((a, b) => (vlanOf(a) ?? 1) - (vlanOf(b) ?? 1) || a.name.localeCompare(b.name));
}

function historyFor(samples: Sample[], netIds: string[]): TrafficPoint[] {
  return samples.map((s) => {
    let down = 0;
    let up = 0;
    let clients = 0;
    for (const id of netIds) {
      const v = s.nets[id];
      if (v) {
        down += v[0];
        up += v[1];
        clients += v[2];
      }
    }
    return { t: s.t, down, up, clients };
  });
}

function radioBand(r?: string): RadioView['band'] {
  if (r === 'ng') return '2.4';
  if (r === 'na') return '5';
  if (r === '6e') return '6';
  return '?';
}

function overallStatus(error: string | null, health: { subsystem: string; status?: string }[], devices: RawDevice[]): SystemStatus {
  if (error) return 'offline';
  const wan = health.find((h) => h.subsystem === 'wan');
  if (wan?.status === 'error') return 'offline';
  if (health.some((h) => h.status === 'warning' || h.status === 'error')) return 'degraded';
  if (devices.some((d) => d.adopted !== false && d.state !== undefined && d.state !== 1)) return 'degraded';
  return health.length ? 'online' : 'unknown';
}

const wanKey = (n: RawNetwork) => (n.wan_networkgroup ?? 'WAN').toUpperCase();

/**
 * WAN connections individually. With a single connection the entry equals the overall view.
 * If the gateway provides no per-connection throughput, the active WAN gets the total.
 */
function wanLinks(
  networks: RawNetwork[],
  gw: RawDevice | undefined,
  activeNet: RawNetwork | undefined,
  total: WanView,
  samples: Sample[],
  mask: boolean,
): WanLinkView[] {
  const nets = networks
    .filter((n) => n.purpose === 'wan' && n.enabled !== false)
    .sort((a, b) => wanKey(a).localeCompare(wanKey(b), 'en', { numeric: true }));
  if (nets.length <= 1) {
    const n = nets[0] ?? activeNet;
    return [
      {
        ...total,
        key: n ? wanKey(n) : 'WAN',
        name: n?.name || total.activeWan || 'WAN',
        isActive: true,
        mode: null,
        role: total.status === 'offline' ? 'offline' : 'active',
        weight: null,
      },
    ];
  }
  const perLink = samples.some((s) => s.wans);
  const types = nets.map((n) => n.wan_load_balance_type?.toLowerCase());
  const mode: WanLinkView['mode'] = types.includes('weighted') ? 'loadbalance' : types.some((t) => t?.startsWith('failover')) ? 'failover' : null;
  const links = nets.map((n) => {
    const key = wanKey(n);
    const isActive = n === activeNet;
    const idx = key === 'WAN' ? 1 : Number(key.slice(3)) || 0;
    const port = idx >= 1 && idx <= 3 ? gw?.[`wan${idx as 1 | 2 | 3}`] : undefined;
    const pick = (s: Sample): [number, number] => (perLink ? (s.wans?.[key] ?? [0, 0]) : isActive ? [s.wanDown, s.wanUp] : [0, 0]);
    const history = samples.map((s) => {
      const [down, up] = pick(s);
      return { t: s.t, down, up, clients: 0 };
    });
    const last = history[history.length - 1];
    const caps = n.wan_provider_capabilities;
    const expDown = num(caps?.download_kilobits_per_second);
    const expUp = num(caps?.upload_kilobits_per_second);
    const expectedDown = expDown && expDown > 0 ? expDown * 1000 : null;
    const expectedUp = expUp && expUp > 0 ? expUp * 1000 : null;
    const ip = port?.ip ?? null;
    const status: WanView['status'] = port?.up === false ? 'offline' : port?.up === true ? 'online' : isActive ? total.status : 'unknown';
    return {
      ...total,
      key,
      name: n.name || key,
      isActive,
      status,
      ip: mask ? maskIp(ip) : ip,
      isp: isActive ? total.isp : null,
      latency: isActive ? total.latency : null,
      down: last?.down ?? 0,
      up: last?.up ?? 0,
      history,
      ...(expectedDown
        ? { capacityDown: expectedDown, capacityUp: expectedUp ?? expectedDown, capacitySource: 'isp' as const }
        : isActive
          ? {}
          : { capacityDown: null, capacityUp: null, capacitySource: null }),
      activeWan: n.name || key,
      expectedDown,
      expectedUp,
      mode,
      role: (status === 'offline'
        ? 'offline'
        : mode === 'loadbalance'
          ? 'active'
          : mode === 'failover'
            ? isActive
              ? 'active'
              : 'standby'
            : isActive || (last?.down ?? 0) + (last?.up ?? 0) > 0
              ? 'active'
              : 'standby') as WanLinkView['role'],
      weight: null as number | null,
      rawWeight: n.wan_load_balance_type?.toLowerCase() === 'weighted' ? (num(n.wan_load_balance_weight) ?? null) : null,
    };
  });
  // Load-balancing share: weight relative to the other active links
  if (mode === 'loadbalance') {
    const sum = links.reduce((s, l) => s + (l.role === 'active' && l.rawWeight ? l.rawWeight : 0), 0);
    for (const l of links) if (sum > 0 && l.role === 'active' && l.rawWeight) l.weight = Math.round((l.rawWeight / sum) * 100);
  }
  return links.map(({ rawWeight: _rw, ...l }) => l);
}

/**
 * Determines the currently active WAN network (for failover/multi-WAN):
 * 1. gateway uplink (uplink.comment/name = WAN, WAN2 …)
 * 2. WAN IP from stat/health matching wan1/wan2 of the gateway
 * 3. otherwise the primary WAN (wan_networkgroup = WAN)
 */
export function findActiveWan(networks: RawNetwork[], gw: RawDevice | undefined, wanIp: string | null): RawNetwork | undefined {
  const wans = networks.filter((n) => n.purpose === 'wan' && n.enabled !== false);
  if (!wans.length) return undefined;
  const byGroup = (g: string | undefined) => (g ? wans.find((n) => (n.wan_networkgroup ?? 'WAN').toUpperCase() === g.toUpperCase()) : undefined);
  const uplinkGroup = [gw?.uplink?.comment, gw?.uplink?.name].find((v) => v && /^WAN\d*$/i.test(v));
  const fromUplink = byGroup(uplinkGroup);
  if (fromUplink) return fromUplink;
  if (wanIp && gw) {
    if (gw.wan2?.ip === wanIp || (gw.wan2?.up && gw.wan1?.up === false)) {
      const w2 = byGroup('WAN2');
      if (w2) return w2;
    }
    if (gw.wan1?.ip === wanIp) {
      const w1 = byGroup('WAN');
      if (w1) return w1;
    }
  }
  return byGroup('WAN') ?? wans[0];
}

/**
 * Restriction to a status page: only its VLAN and device groups (including ones hidden
 * on the main dashboard), no ungrouped networks/devices, WAN optional.
 */
export interface DashboardScope {
  page: StatusPage;
  /** Further status pages of the viewer (for navigation) */
  pages: { slug: string; title: string }[];
  loggedIn: boolean;
}

export async function buildDashboard(site: string, isAdmin: boolean, scope?: DashboardScope): Promise<DashboardPayload> {
  const cfg = getConfig();
  const poller = getPoller();
  await poller.ensureStarted();
  const sites = await poller.listSites();
  const st = poller.getState(site);
  const data = st.data ?? { devices: [], clients: [], networks: [], health: [] };
  const samples = st.history.toArray();
  const latest = samples[samples.length - 1];
  const mask = cfg.hideSensitiveIps && !isAdmin;

  const settings = scope ? { ...getSettings(), showUngrouped: false, showUngroupedDevices: false } : getSettings();
  const allGroups = listGroups(site);
  const groups = scope
    ? allGroups.filter((g) => scope.page.groupIds.includes(g.id)).map((g) => ({ ...g, hidden: false }))
    : allGroups;
  const scopeNets = scope ? new Set(groups.flatMap((g) => g.networkIds)) : null;
  const netSettings = listNetworkSettings(site);
  const deviceNames = new Map(data.devices.map((d) => [d.mac, d.name || d.model || d.mac]));

  // --- Networks & visibility -----------------------------------------------------
  const hiddenGroupNets = new Set(groups.filter((g) => g.hidden).flatMap((g) => g.networkIds));
  const anonGroupNets = new Set(groups.filter((g) => g.anonymizeClients).flatMap((g) => g.networkIds));
  const visibleNets = relevantNetworks(data.networks).filter(
    (n) => !netSettings.get(n._id)?.hidden && !hiddenGroupNets.has(n._id) && (!scopeNets || scopeNets.has(n._id)),
  );
  const visibleIds = new Set(visibleNets.map((n) => n._id));

  // --- Clients per network -------------------------------------------------------
  const clientsByNet = new Map<string, ClientRow[]>();
  let counter = 0;
  for (const c of data.clients) {
    const netId = st.clientNet.get(c.mac) ?? 'unassigned';
    if (!visibleIds.has(netId)) continue;
    const anon = !!netSettings.get(netId)?.anonymizeClients || anonGroupNets.has(netId);
    const r = clientRates(c);
    counter++;
    const row: ClientRow = {
      key: anon || mask ? `c${counter}` : c.mac,
      name: anon ? `Client ${counter}` : c.name || c.hostname || c.mac,
      ip: anon ? null : c.ip ?? null,
      mac: anon ? null : mask ? maskMac(c.mac) : c.mac,
      wired: !!c.is_wired,
      down: r.down,
      up: r.up,
      via: deviceNames.get((c.is_wired ? c.sw_mac : c.ap_mac) ?? '') ?? (c.is_wired ? null : c.essid ?? null),
      networkId: netId,
    };
    const list = clientsByNet.get(netId) ?? [];
    list.push(row);
    clientsByNet.set(netId, list);
  }

  const counts = (rows: ClientRow[]): ClientCounts => {
    const wired = rows.filter((r) => r.wired).length;
    return { total: rows.length, wired, wireless: rows.length - wired };
  };
  const top = (rows: ClientRow[]) => [...rows].sort((a, b) => b.down + b.up - (a.down + a.up)).slice(0, TOP_CLIENTS);

  const networks: Record<string, NetworkView> = {};
  for (const n of visibleNets) {
    const rows = clientsByNet.get(n._id) ?? [];
    const s = latest?.nets[n._id];
    networks[n._id] = {
      id: n._id,
      name: n.name,
      vlan: vlanOf(n),
      subnet: n.ip_subnet ?? null,
      purpose: n.purpose ?? 'corporate',
      anonymized: !!netSettings.get(n._id)?.anonymizeClients || anonGroupNets.has(n._id),
      clients: counts(rows),
      down: s?.[0] ?? 0,
      up: s?.[1] ?? 0,
      history: historyFor(samples, [n._id]),
      topClients: top(rows),
    };
  }

  // --- Groups --------------------------------------------------------------------
  const groupViews: GroupView[] = [];
  const grouped = new Set<string>();
  for (const g of groups) {
    g.networkIds.forEach((id) => grouped.add(id));
    if (g.hidden) continue;
    const ids = g.networkIds.filter((id) => visibleIds.has(id));
    if (!ids.length) continue;
    const rows = ids.flatMap((id) => clientsByNet.get(id) ?? []);
    groupViews.push({
      id: String(g.id),
      name: g.name,
      description: g.description,
      color: g.color,
      displayMode: g.displayMode,
      anonymized: g.anonymizeClients,
      networkIds: ids,
      clients: counts(rows),
      down: ids.reduce((s, id) => s + networks[id].down, 0),
      up: ids.reduce((s, id) => s + networks[id].up, 0),
      history: historyFor(samples, ids),
      topClients: top(rows),
    });
  }
  const ungrouped = settings.showUngrouped ? visibleNets.filter((n) => !grouped.has(n._id)).map((n) => n._id) : [];

  // Remove networks that are not shown from the response
  const shown = new Set([...groupViews.flatMap((g) => g.networkIds), ...ungrouped]);
  for (const id of Object.keys(networks)) if (!shown.has(id)) delete networks[id];

  // --- Hardware -----------------------------------------------------------------
  const clientsPerDevice = new Map<string, number>();
  for (const c of data.clients) {
    const m = c.is_wired ? c.sw_mac : c.ap_mac;
    if (m) clientsPerDevice.set(m, (clientsPerDevice.get(m) ?? 0) + 1);
  }

  const switches: SwitchView[] = data.devices
    .filter((d) => d.type === 'usw')
    .map((d) => {
      const ports: PortView[] = (d.port_table ?? [])
        .slice()
        .sort((a, b) => a.port_idx - b.port_idx)
        .map((p) => ({
          idx: p.port_idx,
          name: p.name ?? `Port ${p.port_idx}`,
          up: !!p.up,
          enabled: p.enable !== false,
          speed: p.up ? p.speed ?? 0 : 0,
          media: p.media ?? null,
          uplink: !!p.is_uplink,
          poe: !!p.poe_enable && (num(p.poe_power) ?? 0) > 0,
          poeCapable: !!p.port_poe,
          poePower: num(p.poe_power) ?? 0,
          down: (p['tx_bytes-r'] ?? 0) * 8,
          up_: (p['rx_bytes-r'] ?? 0) * 8,
        }));
      const poeUsed = num(d.total_used_power) ?? (ports.some((p) => p.poeCapable) ? ports.reduce((s, p) => s + p.poePower, 0) : null);
      const temp = num(d.general_temperature) ?? (d.temperatures?.length ? Math.max(...d.temperatures.map((t) => t.value)) : null);
      return {
        id: d._id,
        mac: d.mac.toLowerCase(),
        name: d.name || d.model || d.mac,
        model: d.model_name || d.model || '',
        ip: d.ip ?? null,
        version: d.version ?? null,
        uptime: num(d.uptime),
        online: d.state === 1,
        temperature: temp,
        overheating: !!d.overheating,
        poeUsed: poeUsed !== null ? Math.round(poeUsed * 10) / 10 : null,
        poeBudget: num(d.total_max_power) ?? num(d.poe_budget),
        clients: clientsPerDevice.get(d.mac) ?? 0,
        ports,
      };
    });

  const aps: ApView[] = data.devices
    .filter((d) => d.type === 'uap')
    .map((d) => {
      const radios: RadioView[] = (d.radio_table_stats ?? []).map((r) => ({
        band: radioBand(r.radio),
        channel: num(r.channel),
        utilization: num(r.cu_total),
        clients: r.num_sta ?? 0,
      }));
      return {
        id: d._id,
        mac: d.mac.toLowerCase(),
        name: d.name || d.model || d.mac,
        model: d.model_name || d.model || '',
        ip: d.ip ?? null,
        version: d.version ?? null,
        uptime: num(d.uptime),
        online: d.state === 1,
        clients: d.num_sta ?? radios.reduce((s, r) => s + r.clients, 0),
        radios,
        down: ((d['tx_bytes-r'] ?? d.uplink?.['rx_bytes-r']) ?? 0) * 8,
        up: ((d['rx_bytes-r'] ?? d.uplink?.['tx_bytes-r']) ?? 0) * 8,
      };
    });

  // --- Device groups -------------------------------------------------------------
  const devGroups = listDeviceGroups(site);
  const devGroupOf = new Map<string, (typeof devGroups)[number]>();
  devGroups.forEach((g) => g.deviceMacs.forEach((m) => devGroupOf.set(m, g)));
  const deviceGroups: DeviceGroupView[] = devGroups
    .filter((g) => (scope ? scope.page.deviceGroupIds.includes(g.id) : !g.hidden))
    .map((g) => ({
      id: String(g.id),
      name: g.name,
      description: g.description,
      color: g.color,
      switchIds: switches.filter((x) => devGroupOf.get(x.mac)?.id === g.id).map((x) => x.id),
      apIds: aps.filter((x) => devGroupOf.get(x.mac)?.id === g.id).map((x) => x.id),
    }))
    .filter((g) => g.switchIds.length + g.apIds.length > 0);
  const ungroupedSwitches = settings.showUngroupedDevices ? switches.filter((x) => !devGroupOf.has(x.mac)).map((x) => x.id) : [];
  const ungroupedAps = settings.showUngroupedDevices ? aps.filter((x) => !devGroupOf.has(x.mac)).map((x) => x.id) : [];
  const shownDevices = new Set([...deviceGroups.flatMap((g) => [...g.switchIds, ...g.apIds]), ...ungroupedSwitches, ...ungroupedAps]);
  const visibleSwitches = switches.filter((x) => shownDevices.has(x.id));
  const visibleAps = aps.filter((x) => shownDevices.has(x.id));

  // --- WAN & Gateway ------------------------------------------------------------
  const wanH = data.health.find((h) => h.subsystem === 'wan');
  const wwwH = data.health.find((h) => h.subsystem === 'www');
  const gwDev = data.devices.find((d) => ['ugw', 'udm', 'uxg'].includes(d.type));
  const gwStats = wanH?.['gw_system-stats'] ?? gwDev?.['system-stats'];
  const status = overallStatus(st.error, data.health, data.devices);
  const degradedByPartial = !st.error && !!st.partialError;
  const wanIp = wanH?.wan_ip ?? gwDev?.wan1?.ip ?? null;

  const activeWanNet = findActiveWan(data.networks, gwDev, wanIp);
  // Newer firmware leaves xput_* at 0 in stat/health: fall back to the latest v2 speedtest of the active WAN.
  const tests = [...(data.speedtests ?? [])].sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  const lastTest = tests.find((s) => activeWanNet && (s.wan_networkgroup ?? '').toUpperCase() === wanKey(activeWanNet)) ?? tests[0];
  const healthXd = num(wwwH?.xput_down);
  const useTest = !(healthXd && healthXd > 0) && !!lastTest;
  const xd = useTest ? num(lastTest!.download_mbps) : healthXd;
  const xu = useTest ? num(lastTest!.upload_mbps) : num(wwwH?.xput_up);
  const peakDown = Math.max(0, ...samples.map((x) => x.wanDown));
  const peakUp = Math.max(0, ...samples.map((x) => x.wanUp));
  const caps = activeWanNet?.wan_provider_capabilities;
  const expDown = num(caps?.download_kilobits_per_second);
  const expUp = num(caps?.upload_kilobits_per_second);
  const expectedDown = expDown && expDown > 0 ? expDown * 1000 : null;
  const expectedUp = expUp && expUp > 0 ? expUp * 1000 : null;
  const [capacityDown, capacityUp, capacitySource]: [number | null, number | null, WanView['capacitySource']] =
    expectedDown
      ? [expectedDown, expectedUp ?? expectedDown, 'isp']
      : cfg.wanDownMbps > 0
      ? [cfg.wanDownMbps * 1e6, (cfg.wanUpMbps || cfg.wanDownMbps) * 1e6, 'config']
      : xd && xd > 0
        ? [xd * 1e6, (xu && xu > 0 ? xu : xd) * 1e6, 'speedtest']
        : peakDown > 0
          ? [peakDown, peakUp || null, 'peak']
          : [null, null, null];
  const wan: WanView = {
    status: !wanH ? 'unknown' : wanH.status === 'ok' ? 'online' : wanH.status === 'error' ? 'offline' : 'degraded',
    ip: mask ? maskIp(wanIp) : wanIp,
    isp: wanH?.isp_name ?? null,
    latency: num(wwwH?.latency) ?? num(wwwH?.speedtest_ping),
    xputDown: xd,
    xputUp: xu,
    down: latest?.wanDown ?? 0,
    up: latest?.wanUp ?? 0,
    history: samples.map((s) => ({ t: s.t, down: s.wanDown, up: s.wanUp, clients: 0 })),
    capacityDown,
    capacityUp,
    capacitySource,
    activeWan: activeWanNet ? activeWanNet.name || activeWanNet.wan_networkgroup || 'WAN' : null,
    expectedDown,
    expectedUp,
  };
  const wans = wanLinks(data.networks, gwDev, activeWanNet, wan, samples, mask);
  const gateway: GatewayView = {
    name: gwDev?.name ?? wanH?.gw_name ?? null,
    model: gwDev?.model_name ?? gwDev?.model ?? null,
    cpu: num(gwStats?.cpu),
    mem: num(gwStats?.mem),
    uptime: num(gwDev?.uptime) ?? num(gwStats?.uptime),
  };

  const allRows = Array.from(clientsByNet.values()).flat();
  const allCounts = scope ? counts(allRows) : counts(data.clients.map((c) => ({ wired: !!c.is_wired }) as ClientRow));

  if (scope) {
    // Derive the status only from the devices (and the WAN, if shown) of the status page
    const scopedMacs = new Set([...visibleSwitches, ...visibleAps].map((d) => d.mac));
    const scopedDevices = data.devices.filter((d) => scopedMacs.has(d.mac.toLowerCase()));
    const scopedStatus: SystemStatus = st.error
      ? 'offline'
      : scope.page.showWan && wan.status === 'offline'
        ? 'offline'
        : scopedDevices.some((d) => d.adopted !== false && d.state !== undefined && d.state !== 1) ||
            (scope.page.showWan && wan.status === 'degraded')
          ? 'degraded'
          : st.lastPoll
            ? 'online'
            : 'unknown';
    return {
      site,
      sites: sites.filter((s) => s.name === site).map((s) => ({ name: s.name, desc: s.desc || s.name })),
      generatedAt: Date.now(),
      lastPoll: st.lastPoll,
      error: st.error ? CONTROLLER_ERROR : null,
      pollingIntervalMs: cfg.pollingIntervalMs,
      isAdmin: false,
      status: scopedStatus,
      wan: scope.page.showWan ? wan : EMPTY_WAN,
      wans: scope.page.showWan ? wans : [],
      gateway: scope.page.showWan ? gateway : EMPTY_GATEWAY,
      totals: { ...allCounts, down: allRows.reduce((s, r) => s + r.down, 0), up: allRows.reduce((s, r) => s + r.up, 0) },
      groups: groupViews,
      networks,
      ungrouped: [],
      switches: visibleSwitches,
      aps: visibleAps,
      deviceGroups,
      ungroupedSwitches: [],
      ungroupedAps: [],
      statusPage: {
        slug: scope.page.slug,
        title: scope.page.title,
        description: scope.page.description,
        showWan: scope.page.showWan,
        isPublic: scope.page.isPublic,
        loggedIn: scope.loggedIn,
        pages: scope.pages,
      },
    };
  }

  return {
    site,
    sites: sites.map((s) => ({ name: s.name, desc: s.desc || s.name })),
    generatedAt: Date.now(),
    lastPoll: st.lastPoll,
    error: st.error ?? st.partialError,
    pollingIntervalMs: cfg.pollingIntervalMs,
    isAdmin,
    status: degradedByPartial && status === 'online' ? 'degraded' : status,
    wan,
    wans,
    gateway,
    totals: {
      ...allCounts,
      down: allRows.reduce((s, r) => s + r.down, 0),
      up: allRows.reduce((s, r) => s + r.up, 0),
    },
    groups: groupViews,
    networks,
    ungrouped,
    switches: visibleSwitches,
    aps: visibleAps,
    deviceGroups,
    ungroupedSwitches,
    ungroupedAps,
  };
}

/** Network list for the admin area (live from /rest/networkconf + stored settings). */
export async function buildAdminNetworks(site: string): Promise<{ networks: AdminNetwork[]; error: string | null }> {
  const poller = getPoller();
  await poller.ensureStarted();
  const st = poller.getState(site);
  if (!st.data) await poller.pollSite(site);
  const groups = listGroups(site);
  const settings = listNetworkSettings(site);
  const groupOf = new Map<string, number>();
  groups.forEach((g) => g.networkIds.forEach((id) => groupOf.set(id, g.id)));
  const networks = relevantNetworks(st.data?.networks ?? []).map((n) => ({
    id: n._id,
    name: n.name,
    vlan: vlanOf(n),
    subnet: n.ip_subnet ?? null,
    purpose: n.purpose ?? 'corporate',
    enabled: n.enabled !== false,
    hidden: settings.get(n._id)?.hidden ?? false,
    anonymizeClients: settings.get(n._id)?.anonymizeClients ?? false,
    groupId: groupOf.get(n._id) ?? null,
  }));
  return { networks, error: st.error };
}

/** Device list (switches & APs) for the admin area incl. group assignment. */
export async function buildAdminDevices(site: string): Promise<{ devices: AdminDevice[]; error: string | null }> {
  const poller = getPoller();
  await poller.ensureStarted();
  const st = poller.getState(site);
  if (!st.data) await poller.pollSite(site);
  const groupOf = new Map<string, number>();
  listDeviceGroups(site).forEach((g) => g.deviceMacs.forEach((m) => groupOf.set(m, g.id)));
  const devices: AdminDevice[] = (st.data?.devices ?? [])
    .filter((d) => d.type === 'usw' || d.type === 'uap')
    .map((d) => ({
      mac: d.mac.toLowerCase(),
      name: d.name || d.model || d.mac,
      model: d.model_name || d.model || '',
      type: d.type === 'usw' ? ('switch' as const) : ('ap' as const),
      ip: d.ip ?? null,
      online: d.state === 1,
      groupId: groupOf.get(d.mac.toLowerCase()) ?? null,
    }))
    .sort((a, b) => a.type.localeCompare(b.type) * -1 || a.name.localeCompare(b.name));
  return { devices, error: st.error };
}
