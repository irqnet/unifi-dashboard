'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, Clock, Radio, Router, Thermometer, Users, Zap } from 'lucide-react';
import { formatBps, formatUptime } from '@/lib/format';
import type { ApView, SwitchView } from '@/lib/views';
import { Meter, StatusBadge } from '../ui/primitives';
import { PortMatrix, SPEED_LEGEND } from './PortMatrix';

function DeviceHeader({ icon, name, model, ip, version, online }: { icon: React.ReactNode; name: string; model: string; ip: string | null; version: string | null; online: boolean }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-noc-raised ring-1 ring-inset ring-noc-line">{icon}</div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-noc-text">{name}</h3>
          <div className="truncate text-xs text-noc-muted">
            {model}
            {ip && <span className="font-mono"> · {ip}</span>}
            {version && <span> · FW {version}</span>}
          </div>
        </div>
      </div>
      <StatusBadge status={online ? 'online' : 'offline'} size="sm" />
    </div>
  );
}

export function SwitchCard({ sw }: { sw: SwitchView }) {
  const upPorts = sw.ports.filter((p) => p.up).length;
  return (
    <div className={clsx('rounded-xl border bg-noc-panel p-4', sw.online ? 'border-noc-line' : 'border-rose-500/40')}>
      <DeviceHeader icon={<Router className="h-4 w-4 text-sky-400" />} name={sw.name} model={sw.model} ip={sw.ip} version={sw.version} online={sw.online} />
      <div className="mb-4 grid grid-cols-2 gap-3 text-xs @md:grid-cols-4">
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <Clock className="h-3 w-3" /> Uptime
          </div>
          <div className="font-mono text-noc-text">{formatUptime(sw.uptime)}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <Thermometer className="h-3 w-3" /> Temperatur
          </div>
          <div className={clsx('font-mono', sw.overheating || (sw.temperature ?? 0) > 70 ? 'text-rose-300' : 'text-noc-text')}>
            {sw.temperature !== null ? `${sw.temperature.toFixed(0)} °C` : '–'}
          </div>
        </div>
        <div>
          <div className="text-noc-muted">Ports aktiv</div>
          <div className="font-mono text-noc-text">
            {upPorts} / {sw.ports.length}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <Zap className="h-3 w-3" /> PoE
          </div>
          {sw.poeUsed !== null ? (
            <>
              <div className="font-mono text-noc-text">
                {sw.poeUsed.toFixed(1)} {sw.poeBudget ? `/ ${sw.poeBudget} W` : 'W'}
              </div>
              {sw.poeBudget ? <Meter value={sw.poeUsed} max={sw.poeBudget} className="mt-1" /> : null}
            </>
          ) : (
            <div className="font-mono text-noc-muted">–</div>
          )}
        </div>
      </div>
      <PortMatrix ports={sw.ports} />
    </div>
  );
}

export function SpeedLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-noc-muted">
      {SPEED_LEGEND.map((l) => (
        <span key={l.label} className="flex items-center gap-1.5">
          <span className={clsx('h-3 w-3 rounded-sm border', l.cls)} />
          {l.label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <Zap className="h-3 w-3 fill-yellow-300 text-yellow-300" /> PoE aktiv
      </span>
    </div>
  );
}

const BAND_COLOR: Record<string, string> = { '2.4': 'text-amber-300', '5': 'text-sky-300', '6': 'text-violet-300', '?': 'text-noc-muted' };

export function ApCard({ ap }: { ap: ApView }) {
  return (
    <div className={clsx('rounded-xl border bg-noc-panel p-4', ap.online ? 'border-noc-line' : 'border-rose-500/40')}>
      <DeviceHeader icon={<Radio className="h-4 w-4 text-sky-400" />} name={ap.name} model={ap.model} ip={ap.ip} version={ap.version} online={ap.online} />
      <div className="mb-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <Users className="h-3 w-3" /> Clients
          </div>
          <div className="font-mono text-lg leading-tight text-noc-text">{ap.clients}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <ArrowDown className="h-3 w-3" /> TX
          </div>
          <div className="font-mono text-sky-300">{formatBps(ap.down)}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-noc-muted">
            <ArrowUp className="h-3 w-3" /> RX
          </div>
          <div className="font-mono text-violet-300">{formatBps(ap.up)}</div>
        </div>
      </div>
      <div className="space-y-2">
        {ap.radios.length === 0 && <p className="text-xs text-noc-muted">Keine Funkdaten.</p>}
        {ap.radios.map((r, i) => (
          <div key={i} className="grid grid-cols-[3.5rem,1fr,auto] items-center gap-2 text-xs">
            <span className={clsx('font-mono font-semibold', BAND_COLOR[r.band])}>{r.band} GHz</span>
            <div>
              <Meter value={r.utilization} warn={50} crit={75} />
            </div>
            <span className="w-32 whitespace-nowrap text-right font-mono text-noc-muted">
              {r.utilization !== null ? `${r.utilization}%` : '–'} · Ch {r.channel ?? '–'} · {r.clients}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1 text-[11px] text-noc-muted">
        <Clock className="h-3 w-3" /> Uptime {formatUptime(ap.uptime)}
      </div>
    </div>
  );
}
