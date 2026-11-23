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
  capacityDown: number | null;
  capacityUp: number | null;
}

const OTHER_ID = '__other';
const OTHER_COLOR = 'rgb(var(--noc-muted))';
const UNIT_KEY = 'ud.wanSplit.unit';
const ARC = 'M 20 88 A 70 70 0 0 1 160 88';
const INNER_ARC = 'M 44 88 A 46 46 0 0 1 136 88';

/**
 * Overall WAN totals. With several connections the throughput is summed up; the capacity is the
 * sum of all active links under load balancing, otherwise that of the active link.
 */
function wanTotals(wan: WanView, links: WanLinkView[]): Totals {
  if (links.length <= 1) return { down: wan.down, up: wan.up, capacityDown: wan.capacityDown, capacityUp: wan.capacityUp };
  const active = links.filter((l) => l.role === 'active');
  const sumCap = (k: 'capacityDown' | 'capacityUp') =>
    active.length && active.every((l) => l[k]) ? active.reduce((s, l) => s + (l[k] ?? 0), 0) : null;
  const lb = links[0].mode === 'loadbalance';
  const primary = links.find((l) => l.isActive) ?? active[0];
  return {
    down: links.reduce((s, l) => s + l.down, 0),
    up: links.reduce((s, l) => s + l.up, 0),
    capacityDown: lb ? sumCap('capacityDown') : (primary?.capacityDown ?? wan.capacityDown),
    capacityUp: lb ? sumCap('capacityUp') : (primary?.capacityUp ?? wan.capacityUp),
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

/** Capacity without needless decimals: 1 Gbit/s, 1.15 Gbit/s, 550 Mbit/s. */
const capText = (bps: number) => formatBps(bps, 2).replace(/(\.\d*?)0+ /, '$1 ').replace('. ', ' ');

const pctText = (v: number) => `${v.toFixed(v > 0 && v < 10 ? 1 : 0)} %`;

/** Semicircle gauge: outer arc = composition of the current throughput, inner arc = line utilisation. */
function SegmentGauge({
  label,
  icon,
  total,
  capacity,
  rows,
  dir,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  total: number;
  capacity: number | null;
  rows: Share[];
  dir: Dir;
  color: string;
}) {
  const { t } = useI18n();
  const scale = rows.reduce((s, r) => s + r[dir], 0);
  let start = 0;
  const segs = scale
    ? rows
        .filter((r) => r[dir] > 0)
        .map((r) => {
          const len = (r[dir] / scale) * 100;
          const seg = { key: r.id, color: r.color, start, len };
          start += len;
          return seg;
        })
    : [];
  const util = capacity ? Math.min(100, (total / capacity) * 100) : null;
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative aspect-[180/96] w-[150px] @md:w-[200px]">
        <svg viewBox="0 0 180 96" className="h-full w-full" aria-hidden>
          <path d={ARC} fill="none" stroke="rgb(var(--c-track))" strokeWidth="16" strokeLinecap="round" />
          <path d={INNER_ARC} fill="none" stroke="rgb(var(--c-track))" strokeWidth="5" strokeLinecap="round" />
          {util !== null && util > 0 && (
            <path
              d={INNER_ARC}
              pathLength={100}
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${util} 100`}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          )}
          {segs.map((s) => (
            <path
              key={s.key}
              d={ARC}
              pathLength={100}
              fill="none"
              stroke={s.color}
              strokeWidth="16"
              strokeDasharray={`${Math.max(0, s.len - (segs.length > 1 ? 0.8 : 0))} 100`}
              strokeDashoffset={-s.start}
              style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
            />
          ))}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center font-mono text-sm font-semibold leading-none tabular-nums text-noc-muted @md:text-base">
          {util !== null ? pctText(util) : '–'}
        </div>
      </div>
      <div className="mt-2 whitespace-nowrap font-mono text-lg font-semibold leading-none tabular-nums @md:text-2xl" style={{ color }}>
        {formatBps(total)}
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[11px] uppercase tracking-wider @md:text-xs" style={{ color }}>
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[11px] text-noc-muted">
        {capacity ? t('wanSplit.utilisationOf', { capacity: capText(capacity) }) : t('wan.capacityUnknown')}
      </div>
    </div>
  );
}

/** Total WAN throughput with the share of each VLAN group, switchable between bit/s and percent. */
export function WanSplitPanel({ wan, links, groups }: { wan: WanView; links: WanLinkView[]; groups: GroupView[] }) {
  const { t } = useI18n();
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
  const max: Record<Dir, number> = {
    down: Math.max(1, ...rows.map((r) => r.down)),
    up: Math.max(1, ...rows.map((r) => r.up)),
  };
  const fmt = (v: number, d: Dir) => (unit === 'pct' ? pctText(totals[d] > 0 ? (v / totals[d]) * 100 : 0) : formatBps(v));
  const cols = '@lg:grid-cols-[minmax(0,1fr),minmax(0,1.2fr),minmax(0,1.2fr)]';

  return (
    <section className="tile-shadow flex h-full flex-col rounded-xl border border-noc-line bg-noc-panel p-3 @md:p-4 @3xl:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
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

      <div className="grid min-h-0 flex-1 items-center gap-5 @3xl:grid-cols-[auto,1fr] @3xl:gap-8">
        <div className="flex items-start justify-around gap-4 @3xl:gap-8">
          <SegmentGauge label="Download" icon={<ArrowDown className="h-3.5 w-3.5" />} total={totals.down} capacity={totals.capacityDown} rows={rows} dir="down" color="rgb(var(--c-down))" />
          <SegmentGauge label="Upload" icon={<ArrowUp className="h-3.5 w-3.5" />} total={totals.up} capacity={totals.capacityUp} rows={rows} dir="up" color="rgb(var(--c-up))" />
        </div>

        <div className="min-w-0">
          <div className={`hidden gap-x-4 border-b border-noc-line pb-1.5 text-[10px] uppercase tracking-wider text-noc-muted @lg:grid ${cols}`}>
            <span>{t('wanSplit.group')}</span>
            <span className="flex items-center gap-1">
              <ArrowDown className="h-3 w-3" /> Download
            </span>
            <span className="flex items-center gap-1">
              <ArrowUp className="h-3 w-3" /> Upload
            </span>
          </div>
          <ul className="divide-y divide-noc-line/60">
            {rows.map((r) => (
              <li key={r.id} className={`grid grid-cols-2 items-center gap-x-4 gap-y-1 py-1.5 text-sm ${cols}`}>
                <span className="col-span-2 flex min-w-0 items-center gap-2 @lg:col-span-1">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
                  <span className={`truncate ${r.id === OTHER_ID ? 'text-noc-muted' : 'text-noc-text'}`}>{r.name}</span>
                </span>
                {(['down', 'up'] as const).map((d) => (
                  <span key={d} className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[10px] text-noc-muted @lg:hidden">{d === 'down' ? '↓' : '↑'}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(var(--c-track))]">
                      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(r[d] / max[d]) * 100}%`, background: r.color }} />
                    </span>
                    <span className="w-[84px] shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums text-noc-text">{fmt(r[d], d)}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 hidden text-[11px] text-noc-muted @md:block">
        {t('wanSplit.legend')}
        {unit === 'pct' ? ` ${t('wanSplit.legendPct')}` : ''}
        {scaled ? ` ${t('wanSplit.scaled')}` : ''}
      </p>
    </section>
  );
}
