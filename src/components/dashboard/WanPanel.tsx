'use client';

import { ArrowDown, ArrowUp, Gauge, Globe, Timer, Users } from 'lucide-react';
import { formatBps, formatMbps } from '@/lib/format';
import type { DashboardPayload } from '@/lib/views';
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
    <div className="flex flex-col items-center">
      <div className="relative h-[96px] w-[180px]">
        <svg viewBox="0 0 180 96" className="h-full w-full" aria-hidden>
          <path d="M 20 88 A 70 70 0 0 1 160 88" fill="none" stroke="#222b38" strokeWidth="14" strokeLinecap="round" />
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
        <div className="absolute inset-x-0 bottom-0 text-center font-mono text-xl font-semibold leading-none tabular-nums" style={{ color: utilColor(pct) ?? '#d7dee9' }}>
          {capacity ? `${pct.toFixed(pct < 10 ? 1 : 0)} %` : '–'}
        </div>
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold leading-none tabular-nums" style={{ color }}>
        {formatBps(value)}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wider text-noc-muted">
        {icon}
        {label}
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

export function WanPanel({ data }: { data: DashboardPayload }) {
  const { wan, totals } = data;
  const h = wan.history;
  const peakDown = h.reduce((m, p) => Math.max(m, p.down), 0);
  const peakUp = h.reduce((m, p) => Math.max(m, p.up), 0);
  const avgDown = h.length ? h.reduce((s, p) => s + p.down, 0) / h.length : 0;
  const avgUp = h.length ? h.reduce((s, p) => s + p.up, 0) / h.length : 0;
  const minutes = h.length > 1 ? Math.round((h[h.length - 1].t - h[0].t) / 60000) : 0;

  return (
    <section className="rounded-xl border border-noc-line bg-noc-panel p-4 lg:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-noc-muted">
          <Globe className="h-4 w-4" /> WAN-Durchsatz
          {wan.isp && <span className="font-normal normal-case tracking-normal text-noc-muted">· {wan.isp}</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-4 text-xs text-noc-muted">
          <span className="flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" /> Latenz <span className="font-mono text-noc-text">{wan.latency !== null ? `${wan.latency} ms` : '–'}</span>
          </span>
          <span className="flex items-center gap-1">
            <Gauge className="h-3.5 w-3.5" /> Speedtest{' '}
            <span className="font-mono text-noc-text">
              ↓ {formatMbps(wan.xputDown)} / ↑ {formatMbps(wan.xputUp)}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> <span className="font-mono text-noc-text">{totals.total}</span> Clients ({totals.wired} LAN / {totals.wireless} WLAN)
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
            <BandwidthGauge label="Download" icon={<ArrowDown className="h-3.5 w-3.5" />} value={wan.down} capacity={wan.capacityDown} color="#38bdf8" />
            <BandwidthGauge label="Upload" icon={<ArrowUp className="h-3.5 w-3.5" />} value={wan.up} capacity={wan.capacityUp} color="#a78bfa" />
          </div>
          <div className="w-full rounded-lg border border-noc-line bg-noc-bg/60 px-3 py-2 text-center">
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
        <div className="min-w-0">
          <TrafficChart id="wan" data={h} height={230} />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Spitze Download" value={formatBps(peakDown)} className="text-sky-300" />
            <MiniStat label="Ø Download" value={formatBps(avgDown)} className="text-sky-300" />
            <MiniStat label="Spitze Upload" value={formatBps(peakUp)} className="text-violet-300" />
            <MiniStat label="Ø Upload" value={formatBps(avgUp)} className="text-violet-300" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-noc-muted">
        {wan.capacitySource ? `Auslastung bezogen auf ${SOURCE_LABEL[wan.capacitySource]}. ` : ''}
        Spitze und Durchschnitt über die letzten {Math.max(1, minutes)} min.
      </p>
    </section>
  );
}
