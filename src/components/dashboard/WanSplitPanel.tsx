'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, PieChart } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatBps } from '@/lib/format';
import type { GroupView, WanLinkView, WanView } from '@/lib/views';

type Unit = 'bps' | 'pct';
type Dir = 'down' | 'up';

interface Share {
  id: string;
  name: string;
  color: string;
  down: number;
  up: number;
}

interface Totals {
  down: number;
  up: number;
  peakDown: number;
  peakUp: number;
  capacityDown: number | null;
  capacityUp: number | null;
  minutes: number;
}

const OTHER_ID = '__other';
const OTHER_COLOR = 'rgb(var(--noc-muted))';
const UNIT_KEY = 'ud.wanSplit.unit';
const ARC = 'M 20 88 A 70 70 0 0 1 160 88';
/** Scale steps in bit/s: 1-2-5 per decade from 10 kbit/s to 100 Gbit/s. */
const STEPS = [1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10].flatMap((d) => [d, 2 * d, 5 * d]);

const peakOf = (h: { down: number; up: number }[], k: Dir) => h.reduce((m, p) => Math.max(m, p[k]), 0);

/**
 * Overall WAN totals. With several connections throughput and history are summed up; the capacity
 * is the sum of all active links under load balancing, otherwise that of the active link.
 */
function wanTotals(wan: WanView, links: WanLinkView[]): Totals {
  const minutesOf = (h: { t: number }[]) => (h.length > 1 ? Math.max(1, Math.round((h[h.length - 1].t - h[0].t) / 60000)) : 1);
  if (links.length <= 1) {
    return {
      down: wan.down,
      up: wan.up,
      peakDown: peakOf(wan.history, 'down'),
      peakUp: peakOf(wan.history, 'up'),
      capacityDown: wan.capacityDown,
      capacityUp: wan.capacityUp,
      minutes: minutesOf(wan.history),
    };
  }
  const len = Math.min(...links.map((l) => l.history.length));
  const history = Array.from({ length: len }, (_, i) => {
    const pts = links.map((l) => l.history[l.history.length - len + i]);
    return { t: pts[0].t, down: pts.reduce((s, p) => s + p.down, 0), up: pts.reduce((s, p) => s + p.up, 0) };
  });
  const active = links.filter((l) => l.role === 'active');
  const sumCap = (k: 'capacityDown' | 'capacityUp') =>
    active.length && active.every((l) => l[k]) ? active.reduce((s, l) => s + (l[k] ?? 0), 0) : null;
  const lb = links[0].mode === 'loadbalance';
  const primary = links.find((l) => l.isActive) ?? active[0];
  return {
    down: links.reduce((s, l) => s + l.down, 0),
    up: links.reduce((s, l) => s + l.up, 0),
    peakDown: peakOf(history, 'down'),
    peakUp: peakOf(history, 'up'),
    capacityDown: lb ? sumCap('capacityDown') : (primary?.capacityDown ?? wan.capacityDown),
    capacityUp: lb ? sumCap('capacityUp') : (primary?.capacityUp ?? wan.capacityUp),
    minutes: minutesOf(history),
  };
}

/**
 * Splits the WAN total across the VLAN groups. Group rates come from client rates, which also
 * contain LAN-internal traffic, so they are scaled down proportionally when they exceed the WAN total.
 * The remainder (gateway, ungrouped networks) becomes an "other" row.
 */
function wanShares(totals: Totals, groups: GroupView[], otherName: string): { rows: Share[]; scaled: boolean } {
  const sumD = groups.reduce((s, g) => s + g.down, 0);
  const sumU = groups.reduce((s, g) => s + g.up, 0);
  const fD = sumD > totals.down && sumD > 0 ? totals.down / sumD : 1;
  const fU = sumU > totals.up && sumU > 0 ? totals.up / sumU : 1;
  const rows: Share[] = groups.map((g) => ({ id: g.id, name: g.name, color: g.color, down: g.down * fD, up: g.up * fU }));
  const restD = Math.max(0, totals.down - sumD * fD);
  const restU = Math.max(0, totals.up - sumU * fU);
  if (restD + restU > 0) rows.push({ id: OTHER_ID, name: otherName, color: OTHER_COLOR, down: restD, up: restU });
  return { rows, scaled: fD < 1 || fU < 1 };
}

/** End of the gauge scale: next 1-2-5 step above the peak, at most the line capacity. */
export function gaugeScale(peak: number, current: number, capacity: number | null): number {
  const need = Math.max(peak, current) * 1.05;
  const step = STEPS.find((s) => s >= need) ?? STEPS[STEPS.length - 1];
  return capacity && capacity > 0 ? Math.min(capacity, step) : step;
}

const pctText = (v: number, tag: string) => {
  if (v > 0 && v < 0.1) return `<${(0.1).toLocaleString(tag)} %`;
  return `${v.toLocaleString(tag, { maximumFractionDigits: v > 0 && v < 10 ? 1 : 0 })} %`;
};
/** Bandwidth without needless decimals: 1 Gbit/s, 1.15 Gbit/s, 5 Mbit/s. */
const capText = (bps: number) => formatBps(bps, 2).replace(/(\.\d*?)0+ /, '$1 ').replace('. ', ' ');
const tickText = (bps: number) => (bps === 0 ? '0' : capText(bps).replace(' Gbit/s', 'G').replace(' Mbit/s', 'M').replace(' kbit/s', 'k'));

/** Linear semicircle gauge with an automatic scale; the arc is split by group colours. */
function ZoomGauge({
  label,
  icon,
  total,
  peak,
  capacity,
  rows,
  dir,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  total: number;
  peak: number;
  capacity: number | null;
  rows: Share[];
  dir: Dir;
  color: string;
}) {
  const { t, tag } = useI18n();
  const max = gaugeScale(peak, total, capacity);
  const fill = Math.min(100, (total / max) * 100);
  const sum = rows.reduce((s, r) => s + r[dir], 0);
  let start = 0;
  const segs = sum
    ? rows
        .filter((r) => r[dir] > 0)
        .map((r) => {
          const len = (fill * r[dir]) / sum;
          const seg = { key: r.id, color: r.color, start, len };
          start += len;
          return seg;
        })
    : [];
  const atLine = !!capacity && max >= capacity;
  const peakAngle = Math.PI * (1 - Math.min(1, peak / max));
  const tick = (f: number) => {
    const a = Math.PI * (1 - f);
    return { x: 90 + 97 * Math.cos(a), y: 92 - 97 * Math.sin(a) };
  };
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative aspect-[228/112] w-[132px] @md:w-[160px]">
        <svg viewBox="-24 -16 228 112" className="h-full w-full" aria-hidden>
          <path d={ARC} fill="none" stroke="rgb(var(--c-track))" strokeWidth="14" strokeLinecap="round" />
          {segs.map((s) => (
            <path
              key={s.key}
              d={ARC}
              pathLength={100}
              fill="none"
              stroke={s.color}
              strokeWidth="14"
              strokeDasharray={`${Math.max(0.8, s.len - (segs.length > 1 ? 0.4 : 0))} 100`}
              strokeDashoffset={-s.start}
              style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
            />
          ))}
          {peak > 0 && (
            <line
              x1={90 + 61 * Math.cos(peakAngle)}
              y1={88 - 61 * Math.sin(peakAngle)}
              x2={90 + 79 * Math.cos(peakAngle)}
              y2={88 - 79 * Math.sin(peakAngle)}
              stroke="rgb(var(--noc-text))"
              strokeWidth="2"
            />
          )}
          {[0, 0.5, 1].map((f) => (
            <text key={f} {...tick(f)} fill="rgb(var(--noc-muted))" fontSize="10" textAnchor="middle">
              {tickText(max * f)}
            </text>
          ))}
          <text x="90" y="82" fill="rgb(var(--noc-muted))" fontSize="10" textAnchor="middle">
            {atLine ? t('wanSplit.scaleLine') : t('wanSplit.scale', { max: capText(max) })}
          </text>
        </svg>
      </div>
      <div className="mt-0.5 whitespace-nowrap font-mono text-base font-semibold leading-none tabular-nums @md:text-lg" style={{ color }}>
        {formatBps(total)}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-[10px] uppercase tracking-wider @md:text-[11px]" style={{ color }}>
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="normal-case tracking-normal text-noc-muted">
          {capacity ? t('wanSplit.ofCapacity', { pct: pctText((total / capacity) * 100, tag), capacity: capText(capacity) }) : t('wan.capacityUnknown')}
        </span>
      </div>
      {capacity ? (
        <div className="mt-1.5 w-[120px] @md:w-[150px]" title={t('wanSplit.slice')}>
          <div className="relative h-1 overflow-hidden rounded-full bg-[rgb(var(--c-track))]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-noc-muted/50" style={{ width: `${Math.max(1.5, (max / capacity) * 100)}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(1, Math.min(100, (total / capacity) * 100))}%`, background: color }} />
          </div>
          <div className="mt-0.5 text-center text-[9.5px] text-noc-muted">{t('wanSplit.slice')}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Total WAN throughput with the share of each VLAN group, switchable between bit/s and percent. */
export function WanSplitPanel({ wan, links, groups }: { wan: WanView; links: WanLinkView[]; groups: GroupView[] }) {
  const { t, tag } = useI18n();
  const [unit, setUnitState] = useState<Unit>('bps');
  useEffect(() => {
    try {
      if (localStorage.getItem(UNIT_KEY) === 'pct') setUnitState('pct');
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setUnit = (u: Unit) => {
    setUnitState(u);
    try {
      localStorage.setItem(UNIT_KEY, u);
    } catch {
      /* storage unavailable */
    }
  };

  const totals = wanTotals(wan, links);
  const { rows, scaled } = wanShares(totals, groups, t('wanSplit.other'));
  const busy = rows.filter((r) => r.down + r.up > 0);
  const idle = rows.filter((r) => r.down + r.up <= 0 && r.id !== OTHER_ID);
  const fmt = (v: number, d: Dir) => (unit === 'pct' ? pctText(totals[d] > 0 ? (v / totals[d]) * 100 : 0, tag) : formatBps(v));

  return (
    <section className="tile-shadow flex h-full flex-col rounded-xl border border-noc-line bg-noc-panel p-3 @3xl:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-noc-text">
          <PieChart className="h-4 w-4 shrink-0 text-noc-muted" /> {t('wanSplit.title')}
          <span className="font-normal text-noc-muted">· {t('wanSplit.total')}</span>
        </h2>
        <div role="group" aria-label={t('wanSplit.unitToggle')} className="inline-flex rounded-lg border border-noc-line bg-noc-bg/60 p-0.5 text-xs">
          {(['bps', 'pct'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              className={`rounded-md px-2.5 py-1 font-medium ${unit === u ? 'bg-fg/10 text-noc-text' : 'text-noc-muted hover:text-noc-text'}`}
            >
              {u === 'bps' ? 'Mbit/s' : '%'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 items-center gap-3 @3xl:grid-cols-[auto,1fr] @3xl:gap-8">
        <div className="flex items-start justify-around gap-3 @3xl:gap-6">
          <ZoomGauge label="Download" icon={<ArrowDown className="h-3 w-3" />} total={totals.down} peak={totals.peakDown} capacity={totals.capacityDown} rows={rows} dir="down" color="rgb(var(--c-down))" />
          <ZoomGauge label="Upload" icon={<ArrowUp className="h-3 w-3" />} total={totals.up} peak={totals.peakUp} capacity={totals.capacityUp} rows={rows} dir="up" color="rgb(var(--c-up))" />
        </div>

        <div className="min-w-0">
          <ul className="divide-y divide-noc-line/60">
            {busy.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr),auto,auto] items-center gap-x-2 py-1 text-xs @md:gap-x-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
                  <span className={`truncate text-sm ${r.id === OTHER_ID ? 'text-noc-muted' : 'text-noc-text'}`}>{r.name}</span>
                </span>
                {(['down', 'up'] as const).map((d) => (
                  <span key={d} className="w-[94px] whitespace-nowrap text-right @md:w-[104px] font-mono tabular-nums text-noc-text">
                    <span className="text-noc-muted">{d === 'down' ? '↓' : '↑'}</span> {fmt(r[d], d)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {idle.length > 0 && <p className="mt-1.5 truncate text-[11px] text-noc-muted">{t('wanSplit.idle', { names: idle.map((r) => r.name).join(', ') })}</p>}
        </div>
      </div>
      <p className="mt-2 hidden text-[10px] text-noc-muted @md:block">
        {t('wanSplit.legend', { minutes: totals.minutes })}
        {unit === 'pct' ? ` ${t('wanSplit.legendPct')}` : ''}
        {scaled ? ` ${t('wanSplit.scaled')}` : ''}
      </p>
    </section>
  );
}
