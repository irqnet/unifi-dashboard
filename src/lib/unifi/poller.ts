/**
 * Hintergrund-Poller mit In-Memory-Ringpuffer.
 * Pollt alle konfigurierten Sites im Intervall POLLING_INTERVAL_MS und speichert pro Poll
 * ein kompaktes Sample (Traffic + Clients je Netzwerk, WAN-Durchsatz) für die letzten
 * HISTORY_MINUTES Minuten. Läuft als Singleton im Node-Prozess (globalThis).
 */
import 'server-only';
import { getConfig } from '../env';
import { UniFiClient } from './client';
import { MOCK_SITES, mockSiteData } from './mock';
import type { RawClient, RawNetwork, RawSite, SiteRawData } from './types';

/** [down bps, up bps, clients gesamt, wired clients] */
export type NetSample = [number, number, number, number];

export interface Sample {
  t: number;
  wanDown: number;
  wanUp: number;
  /** Durchsatz je WAN-Anschluss (Schlüssel WAN, WAN2 …), sofern das Gateway ihn liefert */
  wans?: Record<string, [number, number]>;
  nets: Record<string, NetSample>;
}

export class RingBuffer<T> {
  private buf: (T | undefined)[];
  private start = 0;
  private len = 0;
  constructor(private capacity: number) {
    this.buf = new Array(capacity);
  }
  push(item: T) {
    const idx = (this.start + this.len) % this.capacity;
    this.buf[idx] = item;
    if (this.len < this.capacity) this.len++;
    else this.start = (this.start + 1) % this.capacity;
  }
  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.len; i++) out.push(this.buf[(this.start + i) % this.capacity] as T);
    return out;
  }
  last(): T | undefined {
    return this.len ? this.buf[(this.start + this.len - 1) % this.capacity] : undefined;
  }
}

export interface SiteState {
  site: string;
  data: SiteRawData | null;
  /** Zuordnung Client-MAC → Netzwerk-ID des letzten Polls */
  clientNet: Map<string, string>;
  lastPoll: number | null;
  lastAttempt: number | null;
  error: string | null;
  /** Fehler einzelner Endpunkte bei ansonsten erfolgreichem Poll */
  partialError: string | null;
  history: RingBuffer<Sample>;
  networksFetchedAt: number;
}

const NETWORK_CACHE_MS = 60_000;

/** Rate eines Clients in bit/s aus Sicht des Clients (down = zum Client). */
export function clientRates(c: RawClient): { down: number; up: number } {
  const tx = c.is_wired ? c['wired-tx_bytes-r'] ?? c['tx_bytes-r'] : c['tx_bytes-r'];
  const rx = c.is_wired ? c['wired-rx_bytes-r'] ?? c['rx_bytes-r'] : c['rx_bytes-r'];
  return { down: Math.max(0, (tx ?? 0) * 8), up: Math.max(0, (rx ?? 0) * 8) };
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inSubnet(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const a = ipToInt(ip);
  const b = ipToInt(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/** Ordnet einen Client einem Netzwerk zu: network_id → Netzwerkname → Subnetz-Match. */
export function resolveClientNetwork(c: RawClient, networks: RawNetwork[]): string {
  if (c.network_id && networks.some((n) => n._id === c.network_id)) return c.network_id;
  if (c.network) {
    const byName = networks.find((n) => n.name === c.network);
    if (byName) return byName._id;
  }
  if (c.ip) {
    const bySubnet = networks.find((n) => n.ip_subnet && inSubnet(c.ip!, n.ip_subnet));
    if (bySubnet) return bySubnet._id;
  }
  return 'unassigned';
}

class Poller {
  private client: UniFiClient | null = null;
  private states = new Map<string, SiteState>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private sitesCache: { at: number; sites: RawSite[] } | null = null;
  private cfg = getConfig();

  private api(): UniFiClient {
    if (!this.client) this.client = new UniFiClient(this.cfg.unifi);
    return this.client;
  }

  private capacity() {
    return Math.max(10, Math.ceil((this.cfg.historyMinutes * 60_000) / this.cfg.pollingIntervalMs));
  }

  async listSites(): Promise<RawSite[]> {
    if (this.cfg.unifi.mock) return MOCK_SITES;
    const configured = this.cfg.unifi.sites;
    if (this.sitesCache && Date.now() - this.sitesCache.at < 300_000) return this.sitesCache.sites;
    let all: RawSite[] = [];
    try {
      all = await this.api().sites();
    } catch (err) {
      console.warn('[unifi] Site-Liste nicht abrufbar:', (err as Error).message);
    }
    let sites: RawSite[];
    if (configured.includes('*')) {
      sites = all.length ? all : [{ name: 'default', desc: 'Default' }];
    } else {
      sites = configured.map((name) => all.find((s) => s.name === name) ?? { name, desc: name });
    }
    this.sitesCache = { at: Date.now(), sites };
    return sites;
  }

  getState(site: string): SiteState {
    let st = this.states.get(site);
    if (!st) {
      st = {
        site,
        data: null,
        clientNet: new Map(),
        lastPoll: null,
        lastAttempt: null,
        error: null,
        partialError: null,
        history: new RingBuffer<Sample>(this.capacity()),
        networksFetchedAt: 0,
      };
      this.states.set(site, st);
    }
    return st;
  }

  private async fetchSite(st: SiteState): Promise<SiteRawData> {
    if (this.cfg.unifi.mock) return mockSiteData(st.site);
    const api = this.api();
    const needNetworks = !st.data || Date.now() - st.networksFetchedAt > NETWORK_CACHE_MS;
    const results = await Promise.allSettled([
      api.devices(st.site),
      api.clients(st.site),
      api.health(st.site),
      needNetworks ? api.networks(st.site) : Promise.resolve(st.data!.networks),
    ]);
    // Einzelne fehlerhafte Endpunkte nicht den ganzen Poll kippen lassen:
    // letzten bekannten Stand weiterverwenden, Fehler aber melden.
    const prev = st.data;
    const errors: string[] = [];
    const pick = <T>(r: PromiseSettledResult<T>, fallback: T | undefined): T => {
      if (r.status === 'fulfilled') return r.value;
      errors.push((r.reason as Error)?.message ?? String(r.reason));
      if (fallback === undefined) throw r.reason;
      return fallback;
    };
    const devices = pick(results[0], prev?.devices ?? []);
    const clients = pick(results[1], prev?.clients ?? []);
    const health = pick(results[2], prev?.health ?? []);
    const networks = pick(results[3], prev?.networks ?? []);
    if (results.every((r) => r.status === 'rejected')) throw new Error(errors[0]);
    if (needNetworks && results[3].status === 'fulfilled') st.networksFetchedAt = Date.now();
    st.partialError = errors.length ? errors.join(' · ') : null;
    return { devices, clients, health, networks };
  }

  async pollSite(site: string) {
    const st = this.getState(site);
    st.lastAttempt = Date.now();
    try {
      const data = await this.fetchSite(st);
      const nets: Record<string, NetSample> = {};
      const clientNet = new Map<string, string>();
      for (const c of data.clients) {
        const id = resolveClientNetwork(c, data.networks);
        clientNet.set(c.mac, id);
        const r = clientRates(c);
        const s = (nets[id] ??= [0, 0, 0, 0]);
        s[0] += r.down;
        s[1] += r.up;
        s[2] += 1;
        if (c.is_wired) s[3] += 1;
      }
      const wan = data.health.find((h) => h.subsystem === 'wan');
      const gw = data.devices.find((d) => ['ugw', 'udm', 'uxg'].includes(d.type));
      const wans: Record<string, [number, number]> = {};
      ([1, 2, 3] as const).forEach((i) => {
        const port = gw?.[`wan${i}`];
        if (port && (port['rx_bytes-r'] !== undefined || port['tx_bytes-r'] !== undefined)) {
          wans[i === 1 ? 'WAN' : `WAN${i}`] = [(port['rx_bytes-r'] ?? 0) * 8, (port['tx_bytes-r'] ?? 0) * 8];
        }
      });
      st.history.push({
        t: Date.now(),
        wanDown: (wan?.['rx_bytes-r'] ?? 0) * 8,
        wanUp: (wan?.['tx_bytes-r'] ?? 0) * 8,
        ...(Object.keys(wans).length ? { wans } : {}),
        nets,
      });
      st.data = data;
      st.clientNet = clientNet;
      st.lastPoll = Date.now();
      st.error = null;
    } catch (err) {
      st.error = (err as Error).message || 'Unbekannter Fehler';
      console.error(`[unifi] Poll für Site "${site}" fehlgeschlagen:`, st.error);
      return;
    }
    if (st.partialError) console.warn(`[unifi] Poll für Site "${site}" teilweise fehlgeschlagen:`, st.partialError);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const sites = await this.listSites();
      await Promise.all(sites.map((s) => this.pollSite(s.name)));
    } finally {
      this.running = false;
    }
  }

  /** Startet den Poller (idempotent) und wartet auf den ersten Poll. */
  async ensureStarted(): Promise<void> {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.cfg.pollingIntervalMs);
    this.timer.unref?.();
    await this.tick();
  }
}

const g = globalThis as unknown as { __udPoller?: Poller };

export function getPoller(): Poller {
  if (!g.__udPoller) g.__udPoller = new Poller();
  return g.__udPoller;
}
