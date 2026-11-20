'use client';

import clsx from 'clsx';
import { ArrowUpToLine, Zap } from 'lucide-react';
import { useT } from '@/components/i18n/I18nProvider';
import { formatBps, formatSpeed } from '@/lib/format';
import type { PortView } from '@/lib/views';

export const SPEED_LEGEND = [
  { label: '10G+', cls: 'bg-violet-500/80 border-violet-400' },
  { label: '2.5/5G', cls: 'bg-cyan-500/80 border-cyan-300' },
  { label: '1G', cls: 'bg-emerald-500/80 border-emerald-400' },
  { label: '100M', cls: 'bg-amber-500/80 border-amber-400' },
  { label: '10M', cls: 'bg-orange-600/80 border-orange-500' },
  { label: 'Offline', cls: 'bg-noc-raised border-noc-line' },
];

function portClass(p: PortView): string {
  if (!p.enabled) return 'bg-noc-bg border-noc-line opacity-40';
  if (!p.up) return 'bg-noc-raised border-noc-line';
  if (p.speed >= 10000) return SPEED_LEGEND[0].cls;
  if (p.speed > 1000) return SPEED_LEGEND[1].cls;
  if (p.speed === 1000) return SPEED_LEGEND[2].cls;
  if (p.speed >= 100) return SPEED_LEGEND[3].cls;
  return SPEED_LEGEND[4].cls;
}

function PortCell({ p, alignRight }: { p: PortView; alignRight: boolean }) {
  const t = useT();
  const sfp = p.media?.toUpperCase().includes('SFP');
  return (
    <div className="group relative">
      <div
        tabIndex={0}
        className={clsx(
          'relative flex h-7 items-center justify-center rounded border text-[10px] font-mono font-semibold text-slate-950/80 outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
          sfp ? 'w-9' : 'w-7',
          portClass(p),
          !p.up && 'text-noc-muted',
        )}
      >
        {p.idx}
        {p.poe && <Zap className="absolute -right-1 -top-1 h-3 w-3 fill-yellow-300 text-yellow-300 drop-shadow" />}
        {p.uplink && <ArrowUpToLine className="absolute -left-1 -top-1 h-3 w-3 rounded-sm bg-noc-bg text-sky-300" />}
      </div>
      <div
        role="tooltip"
        className={clsx(
          'pointer-events-none absolute bottom-full z-30 mb-2 hidden w-48 rounded-lg border border-noc-line bg-noc-bg/95 p-2.5 text-xs shadow-xl group-hover:block group-focus-within:block',
          alignRight ? 'right-0' : 'left-0',
        )}
      >
        <div className="mb-1 font-semibold text-noc-text">
          {p.name} <span className="font-normal text-noc-muted">#{p.idx}</span>
        </div>
        <dl className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-noc-muted">
          <dt>{t('port.status')}</dt>
          <dd className="text-right text-noc-text">{!p.enabled ? t('port.disabled') : p.up ? formatSpeed(p.speed) : t('status.offline')}</dd>
          {p.media && (
            <>
              <dt>{t('port.media')}</dt>
              <dd className="text-right text-noc-text">{p.media}</dd>
            </>
          )}
          {p.uplink && (
            <>
              <dt>{t('port.role')}</dt>
              <dd className="text-right text-sky-300">Uplink</dd>
            </>
          )}
          {p.poeCapable && (
            <>
              <dt>PoE</dt>
              <dd className="text-right text-noc-text">{p.poe ? `${p.poePower.toFixed(1)} W` : t('common.off')}</dd>
            </>
          )}
          {p.up && (
            <>
              <dt>RX / TX</dt>
              <dd className="text-right font-mono text-noc-text">
                {formatBps(p.up_)} / {formatBps(p.down)}
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

export function PortMatrix({ ports }: { ports: PortView[] }) {
  const t = useT();
  if (!ports.length) return <p className="text-xs text-noc-muted">{t('port.none')}</p>;
  const copper = ports.filter((p) => !p.media?.toUpperCase().includes('SFP'));
  const sfp = ports.filter((p) => p.media?.toUpperCase().includes('SFP'));
  // Two rows like on the device: odd on top, even below
  const twoRows = copper.length > 8;
  const top = twoRows ? copper.filter((_, i) => i % 2 === 0) : copper;
  const bottom = twoRows ? copper.filter((_, i) => i % 2 === 1) : [];
  const half = (i: number, len: number) => i > len / 2;
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {top.map((p, i) => (
            <PortCell key={p.idx} p={p} alignRight={half(i, top.length)} />
          ))}
        </div>
        {bottom.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bottom.map((p, i) => (
              <PortCell key={p.idx} p={p} alignRight={half(i, bottom.length)} />
            ))}
          </div>
        )}
      </div>
      {sfp.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-l border-noc-line pl-3">
          {sfp.map((p) => (
            <PortCell key={p.idx} p={p} alignRight />
          ))}
        </div>
      )}
    </div>
  );
}
