'use client';

import { ArrowDown, ArrowUp, Globe } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatBps } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/translate';
import type { WanLinkView, WanView } from '@/lib/views';
import { TrafficChart } from './TrafficChart';

const SOURCE_LABEL: Record<NonNullable<WanView['capacitySource']>, MessageKey> = {
  isp: 'wan.source.isp',
  config: 'wan.source.config',
  speedtest: 'wan.source.speedtest',
  peak: 'wan.source.peak',
};

const mbit = (bps: number, tag: string) => `${Math.round(bps / 1e6).toLocaleString(tag)} Mbit/s`;

function utilColor(pct: number) {
  if (pct >= 90) return '#f43f5e';
  if (pct >= 70) return '#f59e0b';
  return null;
}

/** Semicircle gauge: current throughput relative to capacity. */
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
  const { t } = useI18n();
  const pct = capacity ? Math.min(100, (value / capacity) * 100) : 0;
  const stroke = utilColor(pct) ?? color;
  const r = 70;
  const c = Math.PI * r;
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative aspect-[180/96] w-[96px] @md:w-[116px]">
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
        <div className="absolute inset-x-0 bottom-0 text-center font-mono text-xs font-semibold leading-none tabular-nums @md:text-sm" style={{ color: utilColor(pct) ?? 'rgb(var(--noc-text))' }}>
          {capacity ? `${pct.toFixed(pct < 10 ? 1 : 0)} %` : '–'}
        </div>
      </div>
      <div className="mt-1.5 whitespace-nowrap font-mono text-base font-semibold leading-none tabular-nums @md:text-lg" style={{ color }}>
        {formatBps(value)}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 text-[10px] uppercase tracking-wider text-noc-muted @md:text-[11px]">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="normal-case tracking-normal">{capacity ? t('wan.of', { capacity: formatBps(capacity, 0) }) : `· ${t('wan.capacityUnknown')}`}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-noc-line bg-noc-bg/60 px-2 py-1">
      <div className="truncate text-[9px] uppercase tracking-wider text-noc-muted">{label}</div>
      <div className={`truncate font-mono text-xs tabular-nums ${className ?? 'text-noc-text'}`}>{value}</div>
    </div>
  );
}

const STATE: Record<WanLinkView['role'], { label: MessageKey; cls: string }> = {
  active: { label: 'wan.role.active', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  standby: { label: 'wan.role.standby', cls: 'bg-fg/5 text-noc-muted ring-noc-line' },
  offline: { label: 'status.offline', cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' },
};

/** Throughput of one WAN connection. With `link` (multi-WAN) a header of its own per provider. */
export function WanPanel({ wan, link }: { wan: WanView; link?: WanLinkView }) {
  const { t, tag } = useI18n();
  if (link) wan = link;
  const h = wan.history;
  const peakDown = h.reduce((m, p) => Math.max(m, p.down), 0);
  const peakUp = h.reduce((m, p) => Math.max(m, p.up), 0);
  const avgDown = h.length ? h.reduce((s, p) => s + p.down, 0) / h.length : 0;
  const avgUp = h.length ? h.reduce((s, p) => s + p.up, 0) / h.length : 0;
  const minutes = h.length > 1 ? Math.round((h[h.length - 1].t - h[0].t) / 60000) : 0;

  return (
    <section className="tile-shadow flex h-full flex-col rounded-xl border border-noc-line bg-noc-panel p-3 @3xl:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-noc-text">
          <Globe className="h-4 w-4 shrink-0 text-noc-muted" /> {link ? link.name : t('wan.throughput')}
          {wan.isp && <span className="truncate font-normal text-noc-muted">· {wan.isp}</span>}
        </h2>
        {link ? (
          (() => {
            const st = STATE[link.role];
            return (
              <span className="flex items-center gap-2 text-xs text-noc-muted">
                <span className="hidden @md:inline">{link.key === 'WAN' ? 'WAN1' : link.key}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${st.cls}`}>
                  {t(st.label)}
                  {link.role === 'active' && link.weight !== null ? ` · ${link.weight} %` : ''}
                </span>
              </span>
            );
          })()
        ) : (
          wan.activeWan && <span className="hidden text-xs text-noc-muted @md:inline">{wan.activeWan}</span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 @3xl:grid-cols-[auto,1fr] @3xl:gap-6">
        <div className="flex w-full items-start justify-around gap-2 @3xl:gap-6 @3xl:self-center">
          <BandwidthGauge label="Download" icon={<ArrowDown className="h-3 w-3" />} value={wan.down} capacity={wan.capacityDown} color="rgb(var(--c-down))" />
          <BandwidthGauge label="Upload" icon={<ArrowUp className="h-3 w-3" />} value={wan.up} capacity={wan.capacityUp} color="rgb(var(--c-up))" />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="relative min-h-[80px] flex-1 @md:min-h-[96px]">
            <TrafficChart id={link ? `wan-${link.key}` : 'wan'} data={h} fill />
          </div>
          <div className="mt-2 hidden grid-cols-4 gap-1.5 @md:grid">
            <MiniStat label={`${t('wan.peak')} ↓`} value={formatBps(peakDown)} className="text-sky-300" />
            <MiniStat label="Ø ↓" value={formatBps(avgDown)} className="text-sky-300" />
            <MiniStat label={`${t('wan.peak')} ↑`} value={formatBps(peakUp)} className="text-violet-300" />
            <MiniStat label="Ø ↑" value={formatBps(avgUp)} className="text-violet-300" />
          </div>
        </div>
      </div>
      <p className="mt-2 hidden truncate text-[10px] text-noc-muted @md:block">
        {wan.capacitySource
          ? `${t('wan.utilisationBasis', { basis: t(link && wan.capacitySource === 'isp' ? 'wan.source.ispLink' : SOURCE_LABEL[wan.capacitySource]) })} `
          : ''}
        {t('wan.peakAvgWindow', { minutes: Math.max(1, minutes) })}
      </p>
    </section>
  );
}
