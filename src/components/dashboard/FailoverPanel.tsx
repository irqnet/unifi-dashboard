'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ShieldAlert, Signal } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { TFunction } from '@/lib/i18n/translate';

const REFRESH_MS = 60_000;
const DAY = 86_400_000;
/** Backup periods closer together than this count as one outage. */
const MERGE_MS = 60_000;
const EVENTS = 5;

interface Period {
  key: string;
  reason: string | null;
  start: number;
  end: number;
  open: boolean;
  rx: number;
  tx: number;
}

interface Usage {
  key: string;
  rx: number;
  tx: number;
  quotaGb: number | null;
  cycleDay: number;
  cycleStart: string;
  nextReset: string;
}

interface Payload {
  primary: string;
  links: { key: string; name: string; provider: string | null }[];
  now: number;
  from: number;
  since: number | null;
  periods: Period[];
  usage: Usage[];
}

interface Outage {
  start: number;
  end: number;
  open: boolean;
  reason: string | null;
  backupKey: string | null;
  offlineMs: number;
  bytes: number;
}

const wanLabel = (key: string) => (key === 'WAN' ? 'WAN1' : key);

export function formatDuration(ms: number, t: TFunction): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return t('failover.lessThanMinute');
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return t('failover.durDays', { d, h });
  if (h > 0) return t('failover.durHours', { h, m });
  return t('failover.durMinutes', { m });
}

function formatGb(bytes: number, tag: string): string {
  const gb = bytes / 1e9;
  if (gb < 0.1 && bytes > 0) return `${(bytes / 1e6).toLocaleString(tag, { maximumFractionDigits: 0 })} MB`;
  return `${gb.toLocaleString(tag, { minimumFractionDigits: gb < 10 ? 1 : 0, maximumFractionDigits: gb < 10 ? 1 : 0 })} GB`;
}

/** Joins consecutive periods off the primary WAN into outages. */
function outagesOf(periods: Period[], primary: string): Outage[] {
  const out: Outage[] = [];
  for (const p of periods) {
    if (p.key === primary) continue;
    const prev = out[out.length - 1];
    const offline = p.key === '' ? p.end - p.start : 0;
    const bytes = p.key ? p.rx + p.tx : 0;
    if (prev && p.start - prev.end <= MERGE_MS) {
      prev.end = Math.max(prev.end, p.end);
      prev.open = p.open;
      prev.offlineMs += offline;
      prev.bytes += bytes;
      prev.backupKey ??= p.key || null;
    } else {
      out.push({ start: p.start, end: p.end, open: p.open, reason: p.reason, backupKey: p.key || null, offlineMs: offline, bytes });
    }
  }
  return out;
}

/** Failover history of the last 30 days plus the data volume of backup links. */
export function FailoverPanel({ site }: { site: string }) {
  const { t, tag } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/unifi/wan-history${site ? `?site=${encodeURIComponent(site)}` : ''}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Payload;
        if (alive) {
          setData(body);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [site]);

  const view = useMemo(() => {
    if (!data) return null;
    const { primary, from, now } = data;
    const periods = data.periods.map((p) => ({ ...p, start: Math.max(p.start, from), end: Math.min(p.end, now) })).filter((p) => p.end > p.start);
    const outages = outagesOf(periods, primary);
    const observed = periods.reduce((s, p) => s + (p.end - p.start), 0);
    const onPrimary = periods.filter((p) => p.key === primary).reduce((s, p) => s + (p.end - p.start), 0);
    const onBackup = periods.filter((p) => p.key && p.key !== primary).reduce((s, p) => s + (p.end - p.start), 0);
    const longest = outages.reduce<Outage | null>((m, o) => (!m || o.end - o.start > m.end - m.start ? o : m), null);
    const current = data.periods.find((p) => p.open) ?? null;
    return { periods, outages, observed, onPrimary, onBackup, longest, current };
  }, [data]);

  const name = (key: string) => {
    const l = data?.links.find((x) => x.key === key);
    return l && l.name !== key ? `${wanLabel(key)} · ${l.name}` : wanLabel(key);
  };
  const dateTime = (ts: number) => new Date(ts).toLocaleString(tag, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const date = (ts: number | string) => new Date(typeof ts === 'string' ? `${ts}T00:00:00` : ts).toLocaleDateString(tag, { day: '2-digit', month: '2-digit' });
  const reasonText = (o: Outage) =>
    o.reason === 'offline'
      ? t('failover.reasonOffline')
      : o.reason === 'link_down'
        ? t('failover.reasonLinkDown', { wan: wanLabel(data!.primary) })
        : t('failover.reasonSwitched', { wan: wanLabel(o.backupKey ?? '') });

  const usage = (data?.usage ?? []).filter((u) => u.key !== data?.primary || u.quotaGb);

  return (
    <section className="tile-shadow flex h-full flex-col rounded-xl border border-noc-line bg-noc-panel p-3 @3xl:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-noc-text">
          <ShieldAlert className="h-4 w-4 shrink-0 text-noc-muted" /> {t('failover.title')}
          <span className="font-normal text-noc-muted">· {t('failover.days', { n: 30 })}</span>
        </h2>
        {data && view?.current && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${
              view.current.key === data.primary
                ? 'bg-emerald-500/15 text-emerald-400'
                : view.current.key
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-rose-500/15 text-rose-400'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {view.current.key
              ? t('failover.nowVia', { wan: wanLabel(view.current.key), since: formatDuration(data.now - view.current.start, t) })
              : t('failover.nowOffline', { since: formatDuration(data.now - view.current.start, t) })}
          </span>
        )}
      </div>

      {!data || !view ? (
        <div className="flex min-h-[160px] flex-1 items-center justify-center text-xs text-noc-muted">{error ? t('history.error') : t('chart.collecting')}</div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 @3xl:grid-cols-[minmax(0,1fr),300px]">
          <div className="min-w-0">
            <div className="mb-3 grid grid-cols-1 gap-2 @md:grid-cols-3">
              {[
                {
                  label: t('failover.outages', { wan: wanLabel(data.primary) }),
                  value: String(view.outages.length),
                  sub: view.outages.some((o) => o.offlineMs > 0)
                    ? t('failover.withoutInternet', { n: view.outages.filter((o) => o.offlineMs > 0).length })
                    : t('failover.days', { n: 30 }),
                },
                {
                  label: t('failover.backupActive'),
                  value: view.onBackup ? formatDuration(view.onBackup, t) : '–',
                  sub: view.observed
                    ? t('failover.availability', {
                        wan: wanLabel(data.primary),
                        pct: ((view.onPrimary / view.observed) * 100).toLocaleString(tag, { maximumFractionDigits: 1 }),
                      })
                    : '',
                },
                {
                  label: t('failover.longest'),
                  value: view.longest ? formatDuration(view.longest.end - view.longest.start, t) : '–',
                  sub: view.longest ? dateTime(view.longest.start) : '',
                },
              ].map((k) => (
                <div key={k.label} className="min-w-0 rounded-lg border border-noc-line/70 bg-noc-bg/40 px-2.5 py-2">
                  <div className="truncate text-[10px] uppercase tracking-wider text-noc-muted">{k.label}</div>
                  <div className="truncate font-mono text-base font-semibold tabular-nums text-noc-text">{k.value}</div>
                  <div className="truncate text-[11px] text-noc-muted">{k.sub}</div>
                </div>
              ))}
            </div>

            <Timeline from={data.from} now={data.now} periods={view.periods} primary={data.primary} />
            <div className="mt-1 flex justify-between text-[10px] text-noc-muted">
              {[0, 1, 2].map((i) => (
                <span key={i}>{date(data.from + (i * (data.now - data.from)) / 3)}</span>
              ))}
              <span>{t('failover.today')}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-noc-muted">
              {data.links.map((l) => (
                <span key={l.key} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-sm ${l.key === data.primary ? 'bg-emerald-500/60' : 'bg-amber-400'}`} /> {name(l.key)}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-rose-500" /> {t('failover.noInternet')}
              </span>
            </div>

            {view.outages.length > 0 ? (
              <ul className="mt-3 divide-y divide-noc-line/60 text-xs">
                {[...view.outages]
                  .reverse()
                  .slice(0, EVENTS)
                  .map((o) => (
                    <li key={o.start} className="grid grid-cols-[minmax(84px,auto),minmax(0,1fr),auto,auto] items-center gap-x-3 py-1.5">
                      <span className="font-mono tabular-nums text-noc-muted">{dateTime(o.start)}</span>
                      <span className="min-w-0 text-noc-text">{reasonText(o)}</span>
                      <span className={`whitespace-nowrap font-mono tabular-nums ${o.offlineMs > 0 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {o.open ? t('failover.ongoing') : formatDuration(o.end - o.start, t)}
                      </span>
                      <span className="w-14 text-right font-mono tabular-nums text-noc-muted">{o.bytes > 0 ? formatGb(o.bytes, tag) : '–'}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-noc-muted">{t('failover.none')}</p>
            )}
            {data.since && data.since > data.from && <p className="mt-2 text-[11px] text-noc-muted">{t('failover.since', { date: dateTime(data.since) })}</p>}
          </div>

          {usage.length > 0 && (
            <div className="flex flex-col gap-3">
              {usage.map((u) => (
                <UsageBox key={u.key} u={u} title={name(u.key)} provider={data.links.find((l) => l.key === u.key)?.provider ?? null} date={date} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Timeline({ from, now, periods, primary }: { from: number; now: number; periods: Period[]; primary: string }) {
  const span = now - from;
  return (
    <div className="relative h-6 overflow-hidden rounded-md bg-[rgb(var(--c-track))]">
      {periods.map((p, i) => {
        const left = ((p.start - from) / span) * 100;
        const width = ((p.end - p.start) / span) * 100;
        const cls = p.key === primary ? 'bg-emerald-500/40' : p.key ? 'bg-amber-400' : 'bg-rose-500';
        return (
          <span
            key={i}
            className={`absolute inset-y-0 ${cls}`}
            style={{ left: `${left}%`, width: p.key === primary ? `${width}%` : `max(3px, ${width}%)`, zIndex: p.key === primary ? 0 : 1 }}
          />
        );
      })}
    </div>
  );
}

function UsageBox({ u, title, provider, date }: { u: Usage; title: string; provider: string | null; date: (d: string) => string }) {
  const { t, tag } = useI18n();
  const used = u.rx + u.tx;
  const quota = u.quotaGb ? u.quotaGb * 1e9 : null;
  const pct = quota ? (used / quota) * 100 : null;
  const bar = pct === null ? null : pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-amber-400';
  return (
    <div className="rounded-lg border border-noc-line/70 bg-noc-bg/40 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-noc-text">
        <Signal className="h-4 w-4 shrink-0 text-amber-400" /> {t('failover.volume')}
      </div>
      <div className="truncate text-[11px] text-noc-muted">
        {title}
        {provider ? ` · ${provider}` : ''} · {t('failover.sinceDate', { date: date(u.cycleStart) })}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-noc-text">{formatGb(used, tag)}</span>
        {u.quotaGb && <span className="text-xs text-noc-muted">{t('failover.ofQuota', { quota: `${u.quotaGb.toLocaleString(tag)} GB` })}</span>}
      </div>
      {pct !== null && (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgb(var(--c-track))]">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, Math.max(used > 0 ? 1 : 0, pct))}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-noc-muted">
            <span>{t('failover.used', { pct: pct.toLocaleString(tag, { maximumFractionDigits: pct < 10 ? 1 : 0 }) })}</span>
            <span>{t('failover.resets', { date: date(u.nextReset) })}</span>
          </div>
        </>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <ArrowDown className="h-3 w-3" /> Download
          </div>
          <div className="font-mono tabular-nums text-noc-text">{formatGb(u.rx, tag)}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <ArrowUp className="h-3 w-3" /> Upload
          </div>
          <div className="font-mono tabular-nums text-noc-text">{formatGb(u.tx, tag)}</div>
        </div>
      </div>
      {!u.quotaGb && <div className="mt-3 text-[11px] text-noc-muted">{t('failover.quotaHint')}</div>}
    </div>
  );
}
