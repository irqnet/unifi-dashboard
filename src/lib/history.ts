/**
 * Long-term history in SQLite, written by the poller:
 * - traffic per network as 1-minute averages (24 h), then 15-minute averages (7 days)
 * - which WAN carried the internet traffic when (failover periods, 90 days)
 * - data volume per WAN and day (for monthly allowances)
 */
import 'server-only';
import { getDb, listWanQuotas } from './db';
import type { RawDevice, SiteRawData } from './unifi/types';
import { findActiveWan, wanKey, wanNetworks, wanPort } from './unifi/wan';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const COARSE = 15 * MIN;
const RAW_KEEP = DAY;
const COARSE_KEEP = 7 * DAY;
const PERIOD_KEEP = 90 * DAY;
const USAGE_KEEP = 400 * DAY;
/** A period without polls for longer than this is closed (dashboard was not running). */
const PERIOD_GAP = 5 * MIN;
/** Rate integration ignores longer gaps between polls. */
const MAX_DT = 2 * MIN;
/** A new WAN state must be seen this many polls in a row (filters single glitches). */
const CONFIRM_POLLS = 2;

export const WAN_TOTAL = '__wan';

type Pair = [number, number];

interface Acc {
  minute: number;
  n: number;
  nets: Map<string, Pair>;
  wan: Pair;
  /** Bytes per WAN estimated from the rates (rx, tx) */
  bytes: Map<string, Pair>;
  /** Latest byte counters of the gateway per WAN */
  counters: Map<string, Pair>;
}

interface OpenPeriod {
  id: number;
  key: string;
}

interface SiteRec {
  acc: Acc | null;
  lastT: number | null;
  /** undefined = not loaded from the DB yet */
  period: OpenPeriod | null | undefined;
  pending: { key: string; reason: string | null; since: number; count: number } | null;
  /** Time of the last WAN state check */
  lastTrack: number | null;
  lastCompact: number;
}

const g = globalThis as unknown as { __udHistory?: Map<string, SiteRec> };
const recs = (g.__udHistory ??= new Map());

function rec(site: string): SiteRec {
  let r = recs.get(site);
  if (!r) {
    r = { acc: null, lastT: null, period: undefined, pending: null, lastTrack: null, lastCompact: 0 };
    recs.set(site, r);
  }
  return r;
}

/** Server-local calendar day (YYYY-MM-DD). Set TZ in the container for the right day boundaries. */
export function localDay(t: number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const gatewayOf = (data: SiteRawData): RawDevice | undefined => data.devices.find((d) => ['ugw', 'udm', 'uxg'].includes(d.type));

export interface PollSample {
  t: number;
  wanDown: number;
  wanUp: number;
  nets: Record<string, [number, number, number, number]>;
}

/** Called by the poller after every successful poll. Never throws. */
export function recordPoll(site: string, sample: PollSample, data: SiteRawData) {
  try {
    const r = rec(site);
    const minute = Math.floor(sample.t / MIN) * MIN;
    if (r.acc && r.acc.minute !== minute) {
      flush(site, r, r.acc, sample.t);
      r.acc = null;
    }
    const acc = (r.acc ??= { minute, n: 0, nets: new Map(), wan: [0, 0], bytes: new Map(), counters: new Map() });
    acc.n++;
    for (const [id, s] of Object.entries(sample.nets)) {
      const p = acc.nets.get(id) ?? [0, 0];
      p[0] += s[0];
      p[1] += s[1];
      acc.nets.set(id, p);
    }
    acc.wan[0] += sample.wanDown;
    acc.wan[1] += sample.wanUp;

    // Data volume per WAN: gateway byte counters if available, otherwise rate × time
    const dt = r.lastT !== null && sample.t > r.lastT && sample.t - r.lastT <= MAX_DT ? (sample.t - r.lastT) / 1000 : 0;
    r.lastT = sample.t;
    const gw = gatewayOf(data);
    const wans = wanNetworks(data.networks);
    const keys = wans.length ? wans.map(wanKey) : ['WAN'];
    for (const key of keys) {
      const port = wanPort(gw, key);
      let rx = port?.['rx_bytes-r'];
      let tx = port?.['tx_bytes-r'];
      if (rx === undefined && tx === undefined && keys.length === 1) {
        rx = sample.wanDown / 8;
        tx = sample.wanUp / 8;
      }
      if (dt > 0 && (rx || tx)) {
        const b = acc.bytes.get(key) ?? [0, 0];
        b[0] += Math.max(0, rx ?? 0) * dt;
        b[1] += Math.max(0, tx ?? 0) * dt;
        acc.bytes.set(key, b);
      }
      if (typeof port?.rx_bytes === 'number' && typeof port?.tx_bytes === 'number') acc.counters.set(key, [port.rx_bytes, port.tx_bytes]);
    }

    trackWan(site, r, sample.t, data, gw);
  } catch (err) {
    console.error(`[history] Recording for site "${site}" failed:`, (err as Error).message);
  }
}

function flush(site: string, r: SiteRec, acc: Acc, now: number) {
  const db = getDb();
  const insTraffic = db.prepare(
    `INSERT INTO traffic_history (site, t, span, net_id, down, up) VALUES (?, ?, 1, ?, ?, ?)
     ON CONFLICT(site, t, span, net_id) DO UPDATE SET down = excluded.down, up = excluded.up`,
  );
  const getCounter = db.prepare('SELECT rx_bytes, tx_bytes FROM wan_counters WHERE site = ? AND wan_key = ?');
  const setCounter = db.prepare(
    `INSERT INTO wan_counters (site, wan_key, rx_bytes, tx_bytes, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site, wan_key) DO UPDATE SET rx_bytes = excluded.rx_bytes, tx_bytes = excluded.tx_bytes, at = excluded.at`,
  );
  const addUsage = db.prepare(
    `INSERT INTO wan_usage (site, wan_key, day, rx_bytes, tx_bytes) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(site, wan_key, day) DO UPDATE SET rx_bytes = rx_bytes + excluded.rx_bytes, tx_bytes = tx_bytes + excluded.tx_bytes`,
  );
  const addPeriod = db.prepare('UPDATE wan_periods SET rx_bytes = rx_bytes + ?, tx_bytes = tx_bytes + ?, last_seen = ? WHERE id = ?');
  const touchPeriod = db.prepare('UPDATE wan_periods SET last_seen = ? WHERE id = ?');

  db.transaction(() => {
    for (const [id, [d, u]] of acc.nets) insTraffic.run(site, acc.minute, id, d / acc.n, u / acc.n);
    insTraffic.run(site, acc.minute, WAN_TOTAL, acc.wan[0] / acc.n, acc.wan[1] / acc.n);

    const day = localDay(acc.minute);
    for (const key of new Set([...acc.bytes.keys(), ...acc.counters.keys()])) {
      const est = acc.bytes.get(key) ?? [0, 0];
      const cur = acc.counters.get(key);
      let delta: Pair = est;
      if (cur) {
        const prev = getCounter.get(site, key) as { rx_bytes: number; tx_bytes: number } | undefined;
        // Counter went down = gateway restart → fall back to the estimate for this minute
        if (prev && cur[0] >= prev.rx_bytes && cur[1] >= prev.tx_bytes) delta = [cur[0] - prev.rx_bytes, cur[1] - prev.tx_bytes];
        setCounter.run(site, key, cur[0], cur[1], now);
      }
      if (delta[0] + delta[1] <= 0) continue;
      addUsage.run(site, key, day, delta[0], delta[1]);
      if (r.period && r.period.key === key) addPeriod.run(delta[0], delta[1], now, r.period.id);
    }
    if (r.period) touchPeriod.run(now, r.period.id);
  })();

  if (now - r.lastCompact > HOUR) {
    r.lastCompact = now;
    compact(site, now);
  }
}

/** 1-minute values older than 24 h → 15-minute averages; deletes data beyond the retention. */
function compact(site: string, now: number) {
  const db = getDb();
  const cutoff = Math.floor((now - RAW_KEEP) / COARSE) * COARSE;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO traffic_history (site, t, span, net_id, down, up)
       SELECT site, (t / ${COARSE}) * ${COARSE}, 15, net_id, SUM(down) / 15.0, SUM(up) / 15.0
       FROM traffic_history WHERE site = ? AND span = 1 AND t < ?
       GROUP BY t / ${COARSE}, net_id
       ON CONFLICT(site, t, span, net_id) DO UPDATE SET down = down + excluded.down, up = up + excluded.up`,
    ).run(site, cutoff);
    db.prepare('DELETE FROM traffic_history WHERE site = ? AND span = 1 AND t < ?').run(site, cutoff);
    db.prepare('DELETE FROM traffic_history WHERE site = ? AND t < ?').run(site, now - COARSE_KEEP);
    db.prepare('DELETE FROM wan_periods WHERE site = ? AND ended_at IS NOT NULL AND ended_at < ?').run(site, now - PERIOD_KEEP);
    db.prepare('DELETE FROM wan_usage WHERE site = ? AND day < ?').run(site, localDay(now - USAGE_KEEP));
  })();
}

/** Records which WAN is active (failover). Only with two or more WAN connections. */
function trackWan(site: string, r: SiteRec, t: number, data: SiteRawData, gw: RawDevice | undefined) {
  const wans = wanNetworks(data.networks);
  if (wans.length < 2) return;
  const db = getDb();
  const wanH = data.health.find((h) => h.subsystem === 'wan');
  const active = findActiveWan(data.networks, gw, wanH?.wan_ip ?? gw?.wan1?.ip ?? null);
  const primary = wanKey(wans[0]);
  const ports = wans.map((n) => wanPort(gw, wanKey(n)));
  const activeKey = active ? wanKey(active) : primary;
  const activePort = wanPort(gw, activeKey);
  const offline = ports.every((p) => p?.up === false) || (wanH?.status === 'error' && activePort?.up !== true);
  const key = offline ? '' : activeKey;
  const reason = key === primary ? null : key === '' ? 'offline' : wanPort(gw, primary)?.up === false ? 'link_down' : 'switched';

  // Polls stopped for a while (controller unreachable, dashboard paused): close the period there
  const prevTrack = r.lastTrack;
  r.lastTrack = t;
  if (r.period && prevTrack !== null && t - prevTrack > PERIOD_GAP) {
    db.prepare('UPDATE wan_periods SET ended_at = ?, last_seen = ? WHERE id = ?').run(prevTrack, prevTrack, r.period.id);
    r.period = null;
    r.pending = null;
  }
  if (r.period === undefined) {
    const open = db
      .prepare('SELECT id, wan_key, last_seen FROM wan_periods WHERE site = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1')
      .get(site) as { id: number; wan_key: string; last_seen: number } | undefined;
    r.period = open ? { id: open.id, key: open.wan_key } : null;
    if (open && t - open.last_seen > PERIOD_GAP) {
      db.prepare('UPDATE wan_periods SET ended_at = last_seen WHERE id = ?').run(open.id);
      r.period = null;
    }
  }
  const start = (at: number) => {
    const res = db
      .prepare('INSERT INTO wan_periods (site, wan_key, reason, started_at, last_seen) VALUES (?, ?, ?, ?, ?)')
      .run(site, key, reason, at, t);
    r.period = { id: Number(res.lastInsertRowid), key };
    r.pending = null;
  };
  if (!r.period) {
    start(t);
    return;
  }
  if (r.period.key === key) {
    r.pending = null;
    return;
  }
  if (r.pending?.key === key) r.pending.count++;
  else r.pending = { key, reason, since: t, count: 1 };
  if (r.pending.count < CONFIRM_POLLS) return;
  const since = r.pending.since;
  db.transaction(() => {
    db.prepare('UPDATE wan_periods SET ended_at = ?, last_seen = ? WHERE id = ?').run(since, since, r.period!.id);
    start(since);
  })();
}

// --- Queries ---------------------------------------------------------------------

export const HISTORY_RANGES = { 1: MIN, 6: 2 * MIN, 24: 5 * MIN, 168: 30 * MIN } as const;
export type HistoryRange = keyof typeof HISTORY_RANGES;

export interface HistoryPoint {
  t: number;
  wan: Pair;
  groups: Record<string, Pair>;
}

/** Traffic history per group, averaged into buckets that fit the range. */
export function trafficHistory(site: string, hours: HistoryRange, groups: { id: string; networkIds: string[] }[], now = Date.now()) {
  const step = HISTORY_RANGES[hours];
  const from = Math.floor((now - hours * HOUR) / step) * step;
  const netToGroup = new Map<string, string>();
  for (const gr of groups) for (const id of gr.networkIds) netToGroup.set(id, gr.id);
  const rows = getDb()
    .prepare('SELECT t, span, net_id, down, up FROM traffic_history WHERE site = ? AND t >= ? ORDER BY t')
    .all(site, from) as { t: number; span: number; net_id: string; down: number; up: number }[];
  const buckets = new Map<number, { minutes: number; wan: Pair; groups: Record<string, Pair> }>();
  const bucket = (t: number) => {
    const b = Math.floor(t / step) * step;
    let e = buckets.get(b);
    if (!e) buckets.set(b, (e = { minutes: 0, wan: [0, 0], groups: {} }));
    return e;
  };
  for (const row of rows) {
    if (row.net_id === WAN_TOTAL) {
      const e = bucket(row.t);
      e.minutes += row.span;
      e.wan[0] += row.down * row.span;
      e.wan[1] += row.up * row.span;
      continue;
    }
    const gid = netToGroup.get(row.net_id);
    if (!gid) continue;
    const e = bucket(row.t);
    const p = (e.groups[gid] ??= [0, 0]);
    p[0] += row.down * row.span;
    p[1] += row.up * row.span;
  }
  const points: HistoryPoint[] = [];
  for (const [t, e] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (!e.minutes) continue;
    const groupsOut: Record<string, Pair> = {};
    for (const gr of groups) {
      const p = e.groups[gr.id];
      groupsOut[gr.id] = p ? [p[0] / e.minutes, p[1] / e.minutes] : [0, 0];
    }
    points.push({ t, wan: [e.wan[0] / e.minutes, e.wan[1] / e.minutes], groups: groupsOut });
  }
  return { step, from, points };
}

export interface WanPeriod {
  key: string;
  reason: string | null;
  start: number;
  end: number;
  open: boolean;
  rx: number;
  tx: number;
}

export interface WanUsage {
  key: string;
  rx: number;
  tx: number;
  quotaGb: number | null;
  cycleDay: number;
  cycleStart: string;
  nextReset: string;
}

/** Start (inclusive) and end (exclusive) of the current billing month for a reset day. */
export function billingCycle(cycleDay: number, now = new Date()): { start: Date; end: Date } {
  const day = Math.min(28, Math.max(1, Math.round(cycleDay) || 1));
  let start = new Date(now.getFullYear(), now.getMonth(), day);
  if (start > now) start = new Date(now.getFullYear(), now.getMonth() - 1, day);
  return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, day) };
}

export function wanHistory(site: string, keys: string[], days = 30, now = Date.now()) {
  const db = getDb();
  const from = now - days * DAY;
  const rows = db
    .prepare(
      `SELECT wan_key, reason, started_at, last_seen, ended_at, rx_bytes, tx_bytes FROM wan_periods
       WHERE site = ? AND (ended_at IS NULL OR ended_at >= ?) ORDER BY started_at`,
    )
    .all(site, from) as { wan_key: string; reason: string | null; started_at: number; last_seen: number; ended_at: number | null; rx_bytes: number; tx_bytes: number }[];
  const periods: WanPeriod[] = rows.map((p) => {
    const open = p.ended_at === null && now - p.last_seen <= PERIOD_GAP;
    return {
      key: p.wan_key,
      reason: p.reason,
      start: p.started_at,
      end: p.ended_at ?? (open ? now : p.last_seen),
      open,
      rx: p.rx_bytes,
      tx: p.tx_bytes,
    };
  });
  const first = db.prepare('SELECT MIN(started_at) AS t FROM wan_periods WHERE site = ?').get(site) as { t: number | null };

  const quotas = listWanQuotas(site);
  const sumUsage = db.prepare('SELECT COALESCE(SUM(rx_bytes), 0) AS rx, COALESCE(SUM(tx_bytes), 0) AS tx FROM wan_usage WHERE site = ? AND wan_key = ? AND day >= ? AND day < ?');
  const usage: WanUsage[] = keys.map((key) => {
    const q = quotas.get(key) ?? { quotaGb: null, cycleDay: 1 };
    const { start, end } = billingCycle(q.cycleDay, new Date(now));
    const s = sumUsage.get(site, key, localDay(start), localDay(end)) as { rx: number; tx: number };
    return { key, rx: s.rx, tx: s.tx, quotaGb: q.quotaGb, cycleDay: q.cycleDay, cycleStart: localDay(start), nextReset: localDay(end) };
  });
  return { from, since: first.t, periods, usage };
}
