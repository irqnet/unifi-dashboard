'use client';

import { Cpu, Gauge, Globe, Timer, Users, Zap } from 'lucide-react';
import { formatBps, formatMbps } from '@/lib/format';
import type { DashboardPayload } from '@/lib/views';
import { Meter } from '../ui/primitives';
import type { TileDef } from './TileGrid';

function Kpi({ icon, label, children, sub }: { icon: React.ReactNode; label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="tile-shadow flex h-full min-w-0 flex-col rounded-xl border border-noc-line bg-noc-panel px-3 py-2.5 @[11rem]:px-4 @[11rem]:py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-noc-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate font-mono text-base font-semibold tabular-nums text-noc-text @[11rem]:text-xl">{children}</div>
      {sub && <div className="mt-auto truncate pt-0.5 text-[11px] text-noc-muted">{sub}</div>}
    </div>
  );
}

/** Kennzahlen (früher in der Kopfzeile) als eigene kleine Kacheln. */
export function kpiTiles(data: DashboardPayload): TileDef[] {
  const { wan, totals, gateway } = data;
  const ic = 'h-3 w-3 shrink-0';
  return [
    {
      id: 'kpi:wan-ip',
      title: 'WAN-IP',
      w: 2,
      h: 1,
      kpi: true,
      render: () => (
        <Kpi icon={<Globe className={ic} />} label="WAN-IP" sub={wan.isp ?? undefined}>
          {wan.ip ?? '–'}
        </Kpi>
      ),
    },
    {
      id: 'kpi:latency',
      title: 'Latenz',
      w: 2,
      h: 1,
      kpi: true,
      render: () => (
        <Kpi icon={<Timer className={ic} />} label="Latenz" sub={wan.activeWan ?? undefined}>
          {wan.latency !== null ? `${wan.latency} ms` : '–'}
        </Kpi>
      ),
    },
    {
      id: 'kpi:wan-live',
      title: 'WAN live',
      w: 2,
      h: 1,
      kpi: true,
      render: () => (
        <Kpi icon={<Zap className={ic} />} label="WAN live" sub={<span className="text-violet-300">↑ {formatBps(wan.up)}</span>}>
          <span className="text-sky-300">↓ {formatBps(wan.down)}</span>
        </Kpi>
      ),
    },
    {
      id: 'kpi:speedtest',
      title: 'ISP-Speedtest',
      w: 2,
      h: 1,
      kpi: true,
      render: () => (
        <Kpi icon={<Gauge className={ic} />} label="Speedtest" sub={`↑ ${formatMbps(wan.xputUp)}`}>
          ↓ {formatMbps(wan.xputDown)}
        </Kpi>
      ),
    },
    {
      id: 'kpi:clients',
      title: 'Clients',
      w: 2,
      h: 1,
      kpi: true,
      render: () => (
        <Kpi icon={<Users className={ic} />} label="Clients" sub={`${totals.wired} LAN · ${totals.wireless} WLAN`}>
          {totals.total}
        </Kpi>
      ),
    },
    {
      id: 'kpi:gateway',
      title: 'Gateway-Last',
      w: 2,
      h: 1,
      kpi: true,
      render: () => (
        <div className="tile-shadow flex h-full min-w-0 flex-col justify-center gap-2 rounded-xl border border-noc-line bg-noc-panel px-3 py-2.5 @[11rem]:px-4">
          {(
            [
              ['CPU', gateway.cpu],
              ['RAM', gateway.mem],
            ] as const
          ).map(([l, v]) => (
            <div key={l}>
              <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-noc-muted">
                <span className="flex items-center gap-1.5">
                  <Cpu className={ic} /> GW {l}
                </span>
                <span className="font-mono text-xs normal-case tracking-normal text-noc-text">{v !== null ? `${v.toFixed(0)} %` : '–'}</span>
              </div>
              <Meter value={v} className="mt-1" />
            </div>
          ))}
        </div>
      ),
    },
  ];
}
