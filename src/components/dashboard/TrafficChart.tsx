'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBps, formatBpsShort } from '@/lib/format';
import type { TrafficPoint } from '@/lib/views';

const DOWN = '#38bdf8';
const UP = '#a78bfa';

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  const down = payload.find((p) => p.dataKey === 'down')?.value ?? 0;
  const up = payload.find((p) => p.dataKey === 'up')?.value ?? 0;
  return (
    <div className="rounded-lg border border-noc-line bg-noc-bg/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-noc-muted">{label ? new Date(label).toLocaleTimeString('de-DE') : ''}</div>
      <div className="flex items-center gap-2 font-mono tabular-nums" style={{ color: DOWN }}>
        ↓ {formatBps(down)}
      </div>
      <div className="flex items-center gap-2 font-mono tabular-nums" style={{ color: UP }}>
        ↑ {formatBps(up)}
      </div>
    </div>
  );
}

export function TrafficChart({
  data,
  height = 120,
  axes = true,
  id,
}: {
  data: TrafficPoint[];
  height?: number;
  axes?: boolean;
  id: string;
}) {
  const gid = `g-${id.replace(/[^a-zA-Z0-9-]/g, '')}`;
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-noc-muted" style={{ height }}>
        Sammle Verlaufsdaten …
      </div>
    );
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: axes ? 0 : 4 }}>
          <defs>
            <linearGradient id={`${gid}-d`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DOWN} stopOpacity={0.35} />
              <stop offset="100%" stopColor={DOWN} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${gid}-u`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={UP} stopOpacity={0.3} />
              <stop offset="100%" stopColor={UP} stopOpacity={0} />
            </linearGradient>
          </defs>
          {axes && <CartesianGrid stroke="#222b38" strokeDasharray="3 3" vertical={false} />}
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            hide={!axes}
            tickFormatter={(t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            stroke="#7d8ba1"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis hide={!axes} tickFormatter={formatBpsShort} stroke="#7d8ba1" fontSize={10} tickLine={false} axisLine={false} width={46} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#334155' }} />
          <Area type="monotone" dataKey="down" stroke={DOWN} strokeWidth={1.5} fill={`url(#${gid}-d)`} isAnimationActive={false} />
          <Area type="monotone" dataKey="up" stroke={UP} strokeWidth={1.5} fill={`url(#${gid}-u)`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
