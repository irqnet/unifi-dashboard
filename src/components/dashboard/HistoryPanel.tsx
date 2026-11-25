'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, History } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatBps, formatBpsShort } from '@/lib/format';
import type { GroupView } from '@/lib/views';
import { readLocal, Segmented, writeLocal } from './Segmented';

type Dir = 'down' | 'up';
const RANGES = ['1', '6', '24', '168'] as const;
type Range = (typeof RANGES)[number];
const DIRS = ['down', 'up'] as const;

const GRID = 'rgb(var(--c-grid))';
const AXIS = 'rgb(var(--c-axis))';
const OTHER_ID = '__other';
const OTHER_COLOR = 'rgb(var(--noc-muted))';
const REFRESH_MS = 60_000;

interface ApiPoint {
  t: number;
  wan: [number, number];
  groups: Record<string, [number, number]>;
}

interface Series {
  id: string;
  name: string;
  color: string;
}

/**
 * Stacked traffic history per VLAN group. Like the "WAN usage by network" tile, group values are
 * scaled down proportionally when they exceed the WAN total (client rates also contain LAN traffic);
 * the remainder becomes "Other / gateway".
 */
export function HistoryPanel({ site, groups }: { site: string; groups: GroupView[] }) {
  const { t, tag } = useI18n();
  const [dir, setDir] = useState<Dir>('down');
  const [range, setRange] = useState<Range>('24');
  const [points, setPoints] = useState<ApiPoint[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setDir(readLocal('ud.history.dir', DIRS, 'down'));
    setRange(readLocal('ud.history.range', RANGES, '24'));
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/unifi/history?range=${range}${site ? `&site=${encodeURIComponent(site)}` : ''}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { points: ApiPoint[] };
        if (alive) {
          setPoints(body.points);
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
  }, [site, range]);

  const { rows, series } = useMemo(() => {
    const k = dir === 'down' ? 0 : 1;
    let anyOther = false;
    const rows = (points ?? []).map((p) => {
      const vals = groups.map((g) => p.groups[g.id]?.[k] ?? 0);
      const sum = vals.reduce((s, v) => s + v, 0);
      const wan = p.wan[k];
      const f = wan > 0 && sum > wan ? wan / sum : 1;
      const row: Record<string, number> = { t: p.t };
      groups.forEach((g, i) => (row[g.id] = vals[i] * f));
      const other = wan > 0 ? Math.max(0, wan - sum * f) : 0;
      row[OTHER_ID] = other;
      if (other > 0) anyOther = true;
      return row;
    });
    const series: Series[] = groups.map((g) => ({ id: g.id, name: g.name, color: g.color }));
    if (anyOther) series.push({ id: OTHER_ID, name: t('wanSplit.other'), color: OTHER_COLOR });
    return { rows, series };
  }, [points, groups, dir, t]);

  const stats = series.map((s) => {
    const vals = rows.map((r) => r[s.id] ?? 0);
    return { s, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, peak: Math.max(0, ...vals) };
  });

  const long = Number(range) > 24;
  const fmtT = (ts: number) =>
    long
      ? new Date(ts).toLocaleString(tag, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : new Date(ts).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="tile-shadow flex h-full flex-col rounded-xl border border-noc-line bg-noc-panel p-3 @3xl:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-noc-text">
          <History className="h-4 w-4 shrink-0 text-noc-muted" /> {t('history.title')}
          <span className="font-normal text-noc-muted">· {t('history.stacked')}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <Segmented
            label={t('history.direction')}
            value={dir}
            onChange={(v) => {
              setDir(v);
              writeLocal('ud.history.dir', v);
            }}
            options={[
              { value: 'down', label: <span className="flex items-center gap-1"><ArrowDown className="h-3 w-3" /> Download</span> },
              { value: 'up', label: <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" /> Upload</span> },
            ]}
          />
          <Segmented
            label={t('history.range')}
            value={range}
            onChange={(v) => {
              setRange(v);
              writeLocal('ud.history.range', v);
            }}
            options={RANGES.map((r) => ({ value: r, label: r === '168' ? t('history.days', { n: 7 }) : t('history.hours', { n: Number(r) }) }))}
          />
        </div>
      </div>

      {rows.length < 2 ? (
        <div className="flex min-h-[180px] flex-1 items-center justify-center px-4 text-center text-xs text-noc-muted">
          {error ? t('history.error') : points === null ? t('chart.collecting') : t('history.empty')}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 @3xl:grid-cols-[minmax(0,1fr),260px]">
          <div className="h-[220px] @3xl:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtT} stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} minTickGap={50} />
                <YAxis tickFormatter={formatBpsShort} stroke={AXIS} fontSize={10} tickLine={false} axisLine={false} width={46} />
                <Tooltip
                  cursor={{ stroke: AXIS, strokeOpacity: 0.5 }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-noc-line bg-noc-bg/95 px-3 py-2 text-xs shadow-xl">
                        <div className="mb-1 text-noc-muted">{fmtT(label as number)}</div>
                        {[...payload].reverse().map((p) => (
                          <div key={String(p.dataKey)} className="flex justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-noc-text">
                              <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                              {series.find((s) => s.id === p.dataKey)?.name}
                            </span>
                            <span className="font-mono tabular-nums text-noc-text">{formatBps(p.value as number)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null
                  }
                />
                {series.map((s) => (
                  <Area
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    stackId="1"
                    stroke={s.color}
                    strokeWidth={1}
                    fill={s.color}
                    fillOpacity={s.id === OTHER_ID ? 0.25 : 0.45}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <ul className="divide-y divide-noc-line/60 self-center text-xs">
            <li className="grid grid-cols-[minmax(0,1fr),auto,auto] gap-x-3 pb-1 text-[10px] uppercase tracking-wider text-noc-muted">
              <span>{t('history.group')}</span>
              <span className="w-16 text-right">{t('history.avg')}</span>
              <span className="w-16 text-right">{t('history.peak')}</span>
            </li>
            {[...stats].reverse().map(({ s, avg, peak }) => (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr),auto,auto] items-center gap-x-3 py-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className={`truncate text-sm ${s.id === OTHER_ID ? 'text-noc-muted' : 'text-noc-text'}`} title={s.name}>
                    {s.name}
                  </span>
                </span>
                <span className="w-16 text-right font-mono tabular-nums text-noc-text">{formatBpsShort(avg)}</span>
                <span className="w-16 text-right font-mono tabular-nums text-noc-muted">{formatBpsShort(peak)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
