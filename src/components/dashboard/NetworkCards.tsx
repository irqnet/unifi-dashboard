'use client';

import { ArrowDown, ArrowUp, Cable, ChevronRight, EyeOff, Layers, Network, Wifi } from 'lucide-react';
import { formatBps } from '@/lib/format';
import type { ClientCounts, GroupView, NetworkView } from '@/lib/views';
import type { TileDef } from './TileGrid';
import { TrafficChart } from './TrafficChart';

export type DetailTarget = { kind: 'group'; group: GroupView } | { kind: 'network'; network: NetworkView };

function ClientSplit({ c }: { c: ClientCounts }) {
  return (
    <div className="flex items-end gap-4">
      <div>
        <div className="font-mono text-2xl font-semibold leading-none text-noc-text tabular-nums @[15rem]:text-3xl">{c.total}</div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-noc-muted">Clients</div>
      </div>
      <div className="hidden space-y-0.5 pb-0.5 text-xs text-noc-muted @[15rem]:block">
        <div className="flex items-center gap-1.5">
          <Cable className="h-3 w-3" /> <span className="font-mono tabular-nums text-noc-text">{c.wired}</span> LAN
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi className="h-3 w-3" /> <span className="font-mono tabular-nums text-noc-text">{c.wireless}</span> WLAN
        </div>
      </div>
    </div>
  );
}

function Rates({ down, up }: { down: number; up: number }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 whitespace-nowrap text-xs @[15rem]:block @[15rem]:space-y-1 @[15rem]:text-right @[15rem]:text-sm">
      <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-sky-300">
        <ArrowDown className="h-3.5 w-3.5" />
        {formatBps(down)}
      </div>
      <div className="flex items-center justify-end gap-1 font-mono tabular-nums text-violet-300">
        <ArrowUp className="h-3.5 w-3.5" />
        {formatBps(up)}
      </div>
    </div>
  );
}

export function VlanTag({ vlan }: { vlan: number | null }) {
  return (
    <span className="rounded bg-noc-raised px-1.5 py-0.5 font-mono text-[10px] text-noc-muted ring-1 ring-inset ring-noc-line">
      {vlan ? `VLAN ${vlan}` : 'untagged'}
    </span>
  );
}

export function GroupCard({ group, networks, onOpen }: { group: GroupView; networks: Record<string, NetworkView>; onOpen: () => void }) {
  const nets = group.networkIds.map((id) => networks[id]).filter(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="tile-shadow group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-noc-line bg-noc-panel p-3 text-left transition hover:border-noc-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 @[15rem]:p-4"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: group.color }} />
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Layers className="hidden h-4 w-4 shrink-0 @[15rem]:block" style={{ color: group.color }} />
            <h3 className="truncate font-semibold text-noc-text">{group.name}</h3>
            {group.anonymized && <EyeOff className="h-3.5 w-3.5 text-noc-muted" aria-label="Anonymisiert" />}
          </div>
          {group.description && <p className="mt-0.5 truncate text-xs text-noc-muted">{group.description}</p>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-noc-muted transition group-hover:translate-x-0.5 group-hover:text-noc-text" />
      </div>
      <div className="flex flex-col gap-2 @[15rem]:flex-row @[15rem]:items-end @[15rem]:justify-between @[15rem]:gap-3">
        <ClientSplit c={group.clients} />
        <Rates down={group.down} up={group.up} />
      </div>
      <div className="relative -mx-1 mt-3 min-h-[48px] flex-1">
        <TrafficChart id={`grp-${group.id}`} data={group.history} axes={false} fill />
      </div>
      <div className="mt-3 hidden flex-wrap gap-1.5 @[15rem]:flex">
        {nets.map((n) => (
          <span key={n.id} className="inline-flex items-center gap-1 rounded-md bg-noc-raised px-2 py-0.5 text-[11px] text-noc-muted ring-1 ring-inset ring-noc-line">
            {n.name}
            <span className="font-mono opacity-70">{n.vlan ?? '–'}</span>
          </span>
        ))}
      </div>
    </button>
  );
}

export function NetworkCard({ network, onOpen, accent, groupName }: { network: NetworkView; onOpen: () => void; accent?: string; groupName?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="tile-shadow group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-noc-line bg-noc-panel p-3 text-left transition hover:border-noc-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 @[15rem]:p-4"
    >
      {accent && <span className="absolute inset-y-0 left-0 w-1 opacity-60" style={{ background: accent }} />}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Network className="hidden h-4 w-4 shrink-0 text-noc-muted @[15rem]:block" />
            <h3 className="truncate font-semibold text-noc-text">{network.name}</h3>
            {network.anonymized && <EyeOff className="h-3.5 w-3.5 text-noc-muted" aria-label="Anonymisiert" />}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <VlanTag vlan={network.vlan} />
            {network.subnet && <span className="hidden truncate font-mono text-[11px] text-noc-muted @[15rem]:inline">{network.subnet}</span>}
            {groupName && <span className="hidden truncate text-[11px] text-noc-muted @[18rem]:inline">· {groupName}</span>}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-noc-muted transition group-hover:translate-x-0.5 group-hover:text-noc-text" />
      </div>
      <div className="flex flex-col gap-2 @[15rem]:flex-row @[15rem]:items-end @[15rem]:justify-between @[15rem]:gap-3">
        <ClientSplit c={network.clients} />
        <Rates down={network.down} up={network.up} />
      </div>
      <div className="relative -mx-1 mt-3 min-h-[40px] flex-1">
        <TrafficChart id={`net-${network.id}`} data={network.history} axes={false} fill />
      </div>
    </button>
  );
}

/** Kacheln für Netzwerke und VLAN-Gruppen in der Reihenfolge aus dem Admin-Bereich. */
export function networkTiles({
  groups,
  networks,
  ungrouped,
  onOpen,
}: {
  groups: GroupView[];
  networks: Record<string, NetworkView>;
  ungrouped: string[];
  onOpen: (t: DetailTarget) => void;
}): TileDef[] {
  const tiles: TileDef[] = [];
  for (const g of groups) {
    if (g.displayMode === 'expanded') {
      // Aufgeklappte Gruppe: jedes Netzwerk als eigene Kachel
      for (const id of g.networkIds) {
        const n = networks[id];
        if (!n) continue;
        tiles.push({
          id: `net:${id}`,
          title: n.name,
          w: 4,
          h: 2,
          render: () => <NetworkCard network={n} accent={g.color} groupName={g.name} onOpen={() => onOpen({ kind: 'network', network: n })} />,
        });
      }
    } else {
      tiles.push({
        id: `grp:${g.id}`,
        title: g.name,
        w: 4,
        h: 2,
        render: () => <GroupCard group={g} networks={networks} onOpen={() => onOpen({ kind: 'group', group: g })} />,
      });
    }
  }
  for (const id of ungrouped) {
    const n = networks[id];
    if (!n) continue;
    tiles.push({ id: `net:${id}`, title: n.name, w: 4, h: 2, render: () => <NetworkCard network={n} onOpen={() => onOpen({ kind: 'network', network: n })} /> });
  }
  return tiles;
}
