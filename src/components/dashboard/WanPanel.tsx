'use client';

import { ArrowDown, ArrowUp, Globe } from 'lucide-react';
import { formatBps } from '@/lib/format';
import type { WanLinkView, WanView } from '@/lib/views';
import { TrafficChart } from './TrafficChart';

const SOURCE_LABEL = { isp: 'Expected ISP Speeds des aktiven WAN', config: 'gebuchte Bandbreite', speedtest: 'letzter Speedtest', peak: 'Spitzenwert im Verlauf' } as const;

const mbit = (bps: number) => `${Math.round(bps / 1e6).toLocaleString('de-DE')} Mbit/s`;

function utilColor(pct: number) {
  if (pct >= 90) return '#f43f5e';
  if (pct >= 70) return '#f59e0b';
  return null;
}

/** Halbkreis-Gauge: aktueller Durchsatz relativ zur Kapazität. */
function BandwidthGauge({
  label,
  icon,
  value,
  capacity,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  capacity: number | null;
  color: string;
}) {
  const pct = capacity ? Math.min(100, (value / capacity) * 100) : 0;
  const stroke = utilColor(pct) ?? color;
  const r = 70;
  const c = Math.PI * r;
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative aspect-[180/96] w-[132px] @md:w-[180px]">
        <svg viewBox="0 0 180 96" className="h-full w-full" aria-hidden>
          <path d="M 20 88 A 70 70 0 0 1 160 88" fill="none" stroke="rgb(var(--c-track))" strokeWidth="14" strokeLinecap="round" />
          <path
            d="M 20 88 A 70 70 0 0 1 160 88"
            fill="none"
            stroke={stroke}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.3s' }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center font-mono text-base font-semibold leading-none tabular-nums @md:text-xl" style={{ color: utilColor(pct) ?? 'rgb(var(--noc-text))' }}>
          {capacity ? `${pct.toFixed(pct < 10 ? 1 : 0)} %` : '–'}
        </div>
      </div>
      <div className="mt-2 whitespace-nowrap font-mono text-lg font-semibold leading-none tabular-nums @md:mt-3 @md:text-2xl" style={{ color }}>
        {formatBps(value)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] uppercase tracking-wider text-noc-muted @md:text-xs">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="normal-case tracking-normal">{capacity ? `von ${formatBps(capacity, 0)}` : '· Kapazität unbekannt'}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-noc-line bg-noc-bg/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-noc-muted">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${className ?? 'text-noc-text'}`}>{value}</div>
    </div>
  );
}

const STATE = {
  active: { label: 'Aktiv', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  standby: { label: 'Bereit', cls: 'bg-fg/5 text-noc-muted ring-noc-line' },
  offline: { label: 'Offline', cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' },
} as const;

/** Durchsatz eines WAN-Anschlusses. Mit `link` (Multi-WAN) eigene Kopfzeile je Anbieter. */
export function WanPanel({ wan, link }: { wan: WanView; link?: WanLinkView }) {
  if (link) wan = link;
  const h = wan.history;
  const peakDown = h.reduce((m, p) => Math.max(m, p.down), 0);
  const peakUp = h.reduce((m, p) => Math.max(m, p.up), 0);
  const avgDown = h.length ? h.reduce((s, p) => s + p.down, 0) / h.length : 0;
  const avgUp = h.length ? h.reduce((s, p) => s + p.up, 0) / h.length : 0;
  const minutes = h.length > 1 ? Math.round((h[h.length - 1].t - h[0].t) / 60000) : 0;

  return (
    <section className="tile-shadow flex h-full flex-col rounded-xl border border-noc-line bg-noc-panel p-3 @md:p-4 @3xl:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-noc-text">
          <Globe className="h-4 w-4 shrink-0 text-noc-muted" /> {link ? link.name : 'WAN-Durchsatz'}
          {wan.isp && <span className="truncate font-normal text-noc-muted">· {wan.isp}</span>}
        </h2>
        {link ? (
          (() => {
            const st = STATE[link.role];
            return (
              <span className="flex items-center gap-2 text-xs text-noc-muted">
                <span className="hidden @md:inline">{link.key === 'WAN' ? 'WAN1' : link.key}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${st.cls}`}>
                  {st.label}
                  {link.role === 'active' && link.weight !== null ? ` · ${link.weight} %` : ''}
                </span>
              </span>
            );
          })()
        ) : (
          wan.activeWan && <span className="hidden text-xs text-noc-muted @md:inline">{wan.activeWan}</span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 @3xl:grid-cols-[auto,1fr] @3xl:gap-6">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="flex w-full items-start justify-around gap-2 @3xl:gap-6">
            <BandwidthGauge label="Download" icon={<ArrowDown className="h-3.5 w-3.5" />} value={wan.down} capacity={wan.capacityDown} color="rgb(var(--c-down))" />
            <BandwidthGauge label="Upload" icon={<ArrowUp className="h-3.5 w-3.5" />} value={wan.up} capacity={wan.capacityUp} color="rgb(var(--c-up))" />
          </div>
          <div className="hidden w-full rounded-lg border border-noc-line bg-noc-bg/60 px-3 py-2 text-center @md:block">
            <div className="text-[10px] uppercase tracking-wider text-noc-muted">
              Expected ISP Speed{wan.activeWan ? ` · ${wan.activeWan}` : ''}
            </div>
            {wan.expectedDown ? (
              <div className="font-mono text-sm tabular-nums">
                <span className="text-sky-300">↓ {mbit(wan.expectedDown)}</span>
                <span className="mx-2 text-noc-muted">/</span>
                <span className="text-violet-300">↑ {wan.expectedUp ? mbit(wan.expectedUp) : '–'}</span>
              </div>
            ) : (
              <div className="text-xs text-noc-muted">In UniFi nicht hinterlegt (WAN-Einstellungen → Expected ISP Speeds)</div>
            )}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="relative min-h-[110px] flex-1 @md:min-h-[170px]">
            <TrafficChart id={link ? `wan-${link.key}` : 'wan'} data={h} fill />
          </div>
          <div className="mt-3 hidden grid-cols-2 gap-2 @md:grid @5xl:grid-cols-4">
            <MiniStat label="Spitze Download" value={formatBps(peakDown)} className="text-sky-300" />
            <MiniStat label="Ø Download" value={formatBps(avgDown)} className="text-sky-300" />
            <MiniStat label="Spitze Upload" value={formatBps(peakUp)} className="text-violet-300" />
            <MiniStat label="Ø Upload" value={formatBps(avgUp)} className="text-violet-300" />
          </div>
        </div>
      </div>
      <p className="mt-3 hidden text-[11px] text-noc-muted @md:block">
        {wan.capacitySource
          ? `Auslastung bezogen auf ${link && wan.capacitySource === 'isp' ? 'Expected ISP Speeds dieses Anschlusses' : SOURCE_LABEL[wan.capacitySource]}. `
          : ''}
        Spitze und Durchschnitt über die letzten {Math.max(1, minutes)} min.
      </p>
    </section>
  );
}
