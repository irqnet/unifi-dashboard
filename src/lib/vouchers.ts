/**
 * Gäste-WLAN-Voucher (UniFi Hotspot): Vorlagen, Erstellen, Auflisten, Widerrufen.
 * Funktional angelehnt an glenndehaan/unifi-voucher-site (MIT), hier nativ über die
 * klassische Network-API (cmd/hotspot, stat/voucher, stat/guest) neu implementiert.
 */
import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';
import { getConfig } from './env';
import { UniFiClient } from './unifi/client';
import type { RawGuest, RawVoucher } from './unifi/types';

export interface VoucherPreset {
  id: string;
  label: string;
  minutes: number;
  /** 0 = unbegrenzt, 1 = einmalig, n = n Geräte */
  quota: number;
  up: number | null;
  down: number | null;
  megabytes: number | null;
}

export interface VoucherSpec {
  minutes: number;
  quota: number;
  up: number | null;
  down: number | null;
  megabytes: number | null;
}

export type VoucherState = 'unused' | 'active' | 'expired';

export interface VoucherView {
  id: string;
  code: string;
  createdAt: number;
  minutes: number;
  quota: number;
  used: number;
  note: string;
  state: VoucherState;
  /** Ablauf (ms) – erst nach der ersten Nutzung bekannt */
  expiresAt: number | null;
  up: number | null;
  down: number | null;
  megabytes: number | null;
  createdBy: string | null;
  guests: { mac: string; name: string | null; since: number | null; until: number | null }[];
}

export interface VoucherListPayload {
  site: string;
  vouchers: VoucherView[];
  presets: VoucherPreset[];
  wifi: { ssid: string; hasPassword: boolean };
  noteRequired: boolean;
  maxBatch: number;
  mock: boolean;
  /** Fehler beim Laden der Gast-Sitzungen (Liste bleibt trotzdem nutzbar) */
  guestError: string | null;
}

// --- Vorlagen ----------------------------------------------------------------

function num(v: string | undefined): number | null {
  const n = Number.parseInt((v ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function describeSpec(s: VoucherSpec): string {
  const parts = [formatDuration(s.minutes), s.quota === 0 ? 'unbegrenzt nutzbar' : s.quota === 1 ? 'einmalig' : `${s.quota} Geräte`];
  if (s.down || s.up) parts.push(`↓ ${s.down ? formatKbps(s.down) : '∞'} / ↑ ${s.up ? formatKbps(s.up) : '∞'}`);
  if (s.megabytes) parts.push(s.megabytes >= 1024 ? `${(s.megabytes / 1024).toFixed(s.megabytes % 1024 ? 1 : 0)} GB` : `${s.megabytes} MB`);
  return parts.join(' · ');
}

export function formatDuration(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 Tag' : `${minutes / 1440} Tage`;
  if (minutes % 60 === 0) return minutes === 60 ? '1 Stunde' : `${minutes / 60} Stunden`;
  return `${minutes} Minuten`;
}

function formatKbps(kbps: number): string {
  return kbps >= 1000 ? `${+(kbps / 1000).toFixed(1)} Mbit/s` : `${kbps} kbit/s`;
}

/** Parst VOUCHER_PRESETS ("Name=Minuten,Nutzungen,Up,Down,MB;…", kompatibel zu VOUCHER_TYPES). */
export function parsePresets(raw: string): VoucherPreset[] {
  const out: VoucherPreset[] = [];
  for (const entry of raw.split(';')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    const label = eq > 0 ? trimmed.slice(0, eq).trim() : '';
    const [m, q, up, down, mb] = (eq > 0 ? trimmed.slice(eq + 1) : trimmed).split(',');
    const minutes = num(m);
    if (!minutes) {
      console.warn(`[vouchers] Ungültige Vorlage in VOUCHER_PRESETS ignoriert: "${trimmed}"`);
      continue;
    }
    const quotaN = Number.parseInt((q ?? '').trim(), 10);
    const spec: VoucherSpec = {
      minutes,
      quota: Number.isFinite(quotaN) && quotaN >= 0 ? quotaN : 1,
      up: num(up),
      down: num(down),
      megabytes: num(mb),
    };
    out.push({ id: `p${out.length}`, label: label || describeSpec(spec), ...spec });
  }
  return out;
}

export function getPresets(): VoucherPreset[] {
  return parsePresets(getConfig().vouchers.presets);
}

/** Validiert eine frei konfigurierte Voucher-Spezifikation. */
export function parseSpec(body: Record<string, unknown>): { value: VoucherSpec } | { error: string } {
  const int = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
  const minutes = int(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525_600) return { error: 'Gültigkeit muss zwischen 1 Minute und 1 Jahr liegen' };
  const quota = int(body.quota);
  if (!Number.isInteger(quota) || quota < 0 || quota > 10_000) return { error: 'Ungültige Anzahl Nutzungen' };
  const opt = (v: unknown, max: number, label: string): number | null | string => {
    if (v === null || v === undefined || v === '' || v === 0) return null;
    const n = int(v);
    if (!Number.isInteger(n) || n < 1 || n > max) return `${label} ist ungültig`;
    return n;
  };
  const up = opt(body.up, 10_000_000, 'Upload-Limit');
  const down = opt(body.down, 10_000_000, 'Download-Limit');
  const megabytes = opt(body.megabytes, 10_000_000, 'Datenlimit');
  for (const v of [up, down, megabytes]) if (typeof v === 'string') return { error: v };
  return { value: { minutes, quota, up: up as number | null, down: down as number | null, megabytes: megabytes as number | null } };
}

// --- Normalisierung ----------------------------------------------------------

export function formatCode(code: string): string {
  return /^\d{10}$/.test(code) ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

function toView(v: RawVoucher, guests: RawGuest[], now: number): VoucherView {
  const used = v.used ?? 0;
  const mine = guests.filter((g) => (g.voucher_id && g.voucher_id === v._id) || (g.voucher_code && g.voucher_code === v.code));
  const ends = [v.end_time, ...mine.map((g) => g.end)].filter((x): x is number => typeof x === 'number' && x > 0);
  const expiresAt = ends.length ? Math.max(...ends) * 1000 : null;
  const state: VoucherState = used === 0 ? 'unused' : expiresAt !== null && expiresAt < now ? 'expired' : 'active';
  return {
    id: v._id,
    code: formatCode(v.code),
    createdAt: (v.create_time ?? 0) * 1000,
    minutes: v.duration,
    quota: v.quota ?? 1,
    used,
    note: v.note ?? '',
    state,
    expiresAt,
    up: v.qos_rate_max_up || null,
    down: v.qos_rate_max_down || null,
    megabytes: v.qos_usage_quota || null,
    createdBy: v.admin_name ?? null,
    guests: mine.map((g) => ({
      mac: g.mac,
      name: g.name || g.hostname || null,
      since: g.start ? g.start * 1000 : null,
      until: g.end ? g.end * 1000 : null,
    })),
  };
}

// --- Mock-Speicher (UNIFI_MOCK=true) -----------------------------------------

const g = globalThis as unknown as { __udMockVouchers?: Map<string, RawVoucher[]>; __udVoucherClient?: UniFiClient };

function mockStore(site: string): RawVoucher[] {
  g.__udMockVouchers ??= new Map();
  let list = g.__udMockVouchers.get(site);
  if (!list) {
    const now = Math.floor(Date.now() / 1000);
    const mk = (ago: number, duration: number, quota: number, used: number, note: string, extra: Partial<RawVoucher> = {}): RawVoucher => ({
      _id: randomUUID().replace(/-/g, '').slice(0, 24),
      code: String(randomInt(1_000_000_000, 9_999_999_999)),
      create_time: now - ago,
      duration,
      quota,
      used,
      note,
      admin_name: 'admin',
      ...extra,
    });
    list = [
      mk(600, 1440, 1, 0, 'Besuch Familie Meier'),
      mk(3600 * 5, 1440, 1, 1, 'Handwerker Heizung', { start_time: now - 3600 * 4, end_time: now + 3600 * 20 }),
      mk(3600 * 30, 10080, 3, 2, 'Ferienwohnung OG', { start_time: now - 3600 * 29, end_time: now + 3600 * 24 * 5, qos_rate_max_down: 50000, qos_rate_max_up: 10000 }),
      mk(3600 * 50, 480, 0, 4, 'Workshop', { start_time: now - 3600 * 49, end_time: now - 3600 * 41 }),
      mk(3600 * 2, 4320, 1, 0, '', { qos_usage_quota: 5120 }),
    ];
    g.__udMockVouchers.set(site, list);
  }
  return list;
}

function mockGuests(site: string): RawGuest[] {
  const out: RawGuest[] = [];
  const names = ['iphone-gast', 'pixel-gast', 'laptop-gast', 'ipad-gast'];
  for (const v of mockStore(site)) {
    for (let i = 0; i < Math.min(v.used ?? 0, 3); i++) {
      out.push({
        mac: `de:ad:be:ef:${(v.create_time % 256).toString(16).padStart(2, '0')}:${(10 + i).toString(16).padStart(2, '0')}`,
        hostname: names[i % names.length],
        voucher_id: v._id,
        voucher_code: v.code,
        start: v.start_time,
        end: v.end_time,
      });
    }
  }
  return out;
}

function api(): UniFiClient {
  g.__udVoucherClient ??= new UniFiClient(getConfig().unifi);
  return g.__udVoucherClient;
}

// --- Öffentliche Funktionen --------------------------------------------------

export async function listVouchers(site: string): Promise<VoucherListPayload> {
  const cfg = getConfig();
  const now = Date.now();
  let raw: RawVoucher[];
  let guests: RawGuest[] = [];
  let guestError: string | null = null;
  if (cfg.unifi.mock) {
    raw = [...mockStore(site)];
    guests = mockGuests(site);
  } else {
    const [v, gs] = await Promise.allSettled([api().vouchers(site), api().guests(site)]);
    if (v.status === 'rejected') throw v.reason;
    raw = v.value;
    if (gs.status === 'fulfilled') guests = gs.value;
    else guestError = (gs.reason as Error)?.message ?? String(gs.reason);
  }
  const vouchers = raw.map((v) => toView(v, guests, now)).sort((a, b) => b.createdAt - a.createdAt);
  return {
    site,
    vouchers,
    presets: getPresets(),
    wifi: { ssid: cfg.vouchers.ssid, hasPassword: !!cfg.vouchers.wifiPassword },
    noteRequired: cfg.vouchers.noteRequired,
    maxBatch: cfg.vouchers.maxBatch,
    mock: cfg.unifi.mock,
    guestError,
  };
}

/** Erstellt `count` Voucher und gibt die neu erzeugten zurück. */
export async function createVouchers(site: string, spec: VoucherSpec, count: number, note: string): Promise<VoucherView[]> {
  const cfg = getConfig();
  const now = Date.now();
  if (cfg.unifi.mock) {
    const store = mockStore(site);
    const ts = Math.floor(now / 1000);
    const created: RawVoucher[] = Array.from({ length: count }, () => ({
      _id: randomUUID().replace(/-/g, '').slice(0, 24),
      code: String(randomInt(1_000_000_000, 9_999_999_999)),
      create_time: ts,
      duration: spec.minutes,
      quota: spec.quota,
      used: 0,
      note,
      admin_name: 'dashboard',
      qos_rate_max_up: spec.up ?? undefined,
      qos_rate_max_down: spec.down ?? undefined,
      qos_usage_quota: spec.megabytes ?? undefined,
    }));
    store.unshift(...created);
    return created.map((v) => toView(v, [], now));
  }
  const res = await api().createVouchers(site, {
    count,
    minutes: spec.minutes,
    quota: spec.quota,
    note,
    up: spec.up ?? undefined,
    down: spec.down ?? undefined,
    megabytes: spec.megabytes ?? undefined,
  });
  const createTime = res[0]?.create_time;
  const all = await api().vouchers(site);
  const fresh = createTime
    ? all.filter((v) => v.create_time === createTime)
    : all.filter((v) => v.create_time * 1000 >= now - 60_000 && (v.note ?? '') === note);
  return fresh.map((v) => toView(v, [], now));
}

export async function deleteVouchers(site: string, ids: string[]): Promise<{ deleted: number; errors: string[] }> {
  const cfg = getConfig();
  if (cfg.unifi.mock) {
    const store = mockStore(site);
    let deleted = 0;
    for (const id of ids) {
      const i = store.findIndex((v) => v._id === id);
      if (i >= 0) {
        store.splice(i, 1);
        deleted++;
      }
    }
    return { deleted, errors: [] };
  }
  const results = await Promise.allSettled(ids.map((id) => api().deleteVoucher(site, id)));
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => (r.reason as Error)?.message ?? String(r.reason));
  return { deleted: results.length - errors.length, errors: Array.from(new Set(errors)) };
}

/** WLAN-Infos für Ausdruck/QR-Code (Passwort nur für Admins, die drucken). */
export function wifiInfo() {
  const { ssid, wifiPassword } = getConfig().vouchers;
  return { ssid, password: wifiPassword };
}
