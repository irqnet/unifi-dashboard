/**
 * Guest Wi-Fi vouchers (UniFi hotspot): presets, create, list, revoke.
 * Functionally modelled on glenndehaan/unifi-voucher-site (MIT), re-implemented
 * natively on the classic Network API (cmd/hotspot, stat/voucher, stat/guest).
 */
import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';
import { getConfig } from './env';
import type { TFunction } from './i18n/translate';
import { describeSpec, type VoucherSpec } from './voucherFormat';
import { UniFiClient } from './unifi/client';
import type { RawGuest, RawVoucher } from './unifi/types';

export interface VoucherPreset {
  id: string;
  label: string;
  minutes: number;
  /** 0 = unlimited, 1 = single use, n = n devices */
  quota: number;
  up: number | null;
  down: number | null;
  megabytes: number | null;
}

export type { VoucherSpec };

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
  /** Expiry (ms) – only known after first use */
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
  /** Error loading guest sessions (the list remains usable) */
  guestError: string | null;
}

// --- Presets ------------------------------------------------------------------

function num(v: string | undefined): number | null {
  const n = Number.parseInt((v ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parses VOUCHER_PRESETS ("Name=minutes,uses,up,down,MB;…", compatible with VOUCHER_TYPES). */
export function parsePresets(raw: string, t: TFunction): VoucherPreset[] {
  const out: VoucherPreset[] = [];
  for (const entry of raw.split(';')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    const label = eq > 0 ? trimmed.slice(0, eq).trim() : '';
    const [m, q, up, down, mb] = (eq > 0 ? trimmed.slice(eq + 1) : trimmed).split(',');
    const minutes = num(m);
    if (!minutes) {
      console.warn(`[vouchers] Ignoring invalid preset in VOUCHER_PRESETS: "${trimmed}"`);
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
    out.push({ id: `p${out.length}`, label: label || describeSpec(spec, t), ...spec });
  }
  return out;
}

export function getPresets(t: TFunction): VoucherPreset[] {
  return parsePresets(getConfig().vouchers.presets, t);
}

/** Validates a custom voucher specification. */
export function parseSpec(body: Record<string, unknown>, t: TFunction): { value: VoucherSpec } | { error: string } {
  const int = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
  const minutes = int(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525_600) return { error: t('voucher.error.duration') };
  const quota = int(body.quota);
  if (!Number.isInteger(quota) || quota < 0 || quota > 10_000) return { error: t('voucher.error.quota') };
  const opt = (v: unknown, max: number, label: string): number | null | string => {
    if (v === null || v === undefined || v === '' || v === 0) return null;
    const n = int(v);
    if (!Number.isInteger(n) || n < 1 || n > max) return t('voucher.error.invalidField', { field: label });
    return n;
  };
  const up = opt(body.up, 10_000_000, t('voucher.field.upLimit'));
  const down = opt(body.down, 10_000_000, t('voucher.field.downLimit'));
  const megabytes = opt(body.megabytes, 10_000_000, t('voucher.field.dataLimit'));
  for (const v of [up, down, megabytes]) if (typeof v === 'string') return { error: v };
  return { value: { minutes, quota, up: up as number | null, down: down as number | null, megabytes: megabytes as number | null } };
}

// --- Normalisation ----------------------------------------------------------

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

// --- Mock store (UNIFI_MOCK=true) -----------------------------------------

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
      mk(600, 1440, 1, 0, 'Visit: the Millers'),
      mk(3600 * 5, 1440, 1, 1, 'Heating engineer', { start_time: now - 3600 * 4, end_time: now + 3600 * 20 }),
      mk(3600 * 30, 10080, 3, 2, 'Holiday flat upstairs', { start_time: now - 3600 * 29, end_time: now + 3600 * 24 * 5, qos_rate_max_down: 50000, qos_rate_max_up: 10000 }),
      mk(3600 * 50, 480, 0, 4, 'Workshop', { start_time: now - 3600 * 49, end_time: now - 3600 * 41 }),
      mk(3600 * 2, 4320, 1, 0, '', { qos_usage_quota: 5120 }),
    ];
    g.__udMockVouchers.set(site, list);
  }
  return list;
}

function mockGuests(site: string): RawGuest[] {
  const out: RawGuest[] = [];
  const names = ['iphone-guest', 'pixel-guest', 'laptop-guest', 'ipad-guest'];
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

// --- Public functions --------------------------------------------------

export async function listVouchers(site: string, t: TFunction): Promise<VoucherListPayload> {
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
    presets: getPresets(t),
    wifi: { ssid: cfg.vouchers.ssid, hasPassword: !!cfg.vouchers.wifiPassword },
    noteRequired: cfg.vouchers.noteRequired,
    maxBatch: cfg.vouchers.maxBatch,
    mock: cfg.unifi.mock,
    guestError,
  };
}

/** Creates `count` vouchers and returns the newly created ones. */
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

/** Wi-Fi details for the printout/QR code (password only for admins who print). */
export function wifiInfo() {
  const { ssid, wifiPassword } = getConfig().vouchers;
  return { ssid, password: wifiPassword };
}
