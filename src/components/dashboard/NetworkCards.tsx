'use client';

import { ArrowDown, ArrowUp, Cable, ChevronRight, EyeOff, Layers, Network, Wifi } from 'lucide-react';
import { formatBps } from '@/lib/format';
import type { ClientCounts, GroupView, NetworkView } from '@/lib/views';
import { TrafficChart } from './TrafficChart';

export type DetailTarget = { kind: 'group'; group: GroupView } | { kind: 'network'; network: NetworkView };

function ClientSplit({ c }: { c: ClientCounts }) {
  return (
    <div className="flex items-end gap-4">
      <div>
        <div className="font-mono text-3xl font-semibold leading-none text-noc-text tabular-nums">{c.total}</div>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-noc-muted">Clients</div>
      </div>
      <div className="space-y-0.5 pb-0.5 text-xs text-noc-muted">
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
    <div className="space-y-1 text-right">
      <div className="flex items-center justify-end gap-1 font-mono text-sm tabular-nums text-sky-300">
        <ArrowDown className="h-3.5 w-3.5" />
        {formatBps(down)}
      </div>
      <div className="flex items-center justify-end gap-1 font-mono text-sm tabular-nums text-violet-300">
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
      className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-noc-line bg-noc-panel p-4 text-left transition hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: group.color }} />
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 shrink-0" style={{ color: group.color }} />
            <h3 className="truncate font-semibold text-noc-text">{group.name}</h3>
            {group.anonymized && <EyeOff className="h-3.5 w-3.5 text-noc-muted" aria-label="Anonymisiert" />}
          </div>
          {group.description && <p className="mt-0.5 truncate text-xs text-noc-muted">{group.description}</p>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-noc-muted transition group-hover:translate-x-0.5 group-hover:text-noc-text" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <ClientSplit c={group.clients} />
        <Rates down={group.down} up={group.up} />
      </div>
      <div className="-mx-1 mt-3">
        <TrafficChart id={`grp-${group.id}`} data={group.history} height={90} axes={false} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
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

export function NetworkCard({ network, onOpen, accent }: { network: NetworkView; onOpen: () => void; accent?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-noc-line bg-noc-panel p-4 text-left transition hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    >
      {accent && <span className="absolute inset-y-0 left-0 w-1 opacity-60" style={{ background: accent }} />}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 shrink-0 text-noc-muted" />
            <h3 className="truncate font-semibold text-noc-text">{network.name}</h3>
            {network.anonymized && <EyeOff className="h-3.5 w-3.5 text-noc-muted" aria-label="Anonymisiert" />}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <VlanTag vlan={network.vlan} />
            {network.subnet && <span className="font-mono text-[11px] text-noc-muted">{network.subnet}</span>}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-noc-muted transition group-hover:translate-x-0.5 group-hover:text-noc-text" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <ClientSplit c={network.clients} />
        <Rates down={network.down} up={network.up} />
      </div>
      <div className="-mx-1 mt-3">
        <TrafficChart id={`net-${network.id}`} data={network.history} height={70} axes={false} />
      </div>
    </button>
  );
}

export function NetworkSection({
  groups,
  networks,
  ungrouped,
  onOpen,
}: {
  groups: GroupView[];
  networks: Record<string, NetworkView>;
  ungrouped: string[];
  onOpen: (t: DetailTarget) => void;
}) {
  if (!groups.length && !ungrouped.length) {
    return (
      <div className="rounded-xl border border-dashed border-noc-line p-8 text-center text-sm text-noc-muted">
        Keine Netzwerke freigegeben. Im Admin-Bereich können Gruppen angelegt oder nicht gruppierte VLANs eingeblendet werden.
      </div>
    );
  }
  // Reihenfolge aus dem Admin-Bereich beibehalten: aufeinanderfolgende konsolidierte Gruppen teilen sich ein Grid
  const segments: ({ type: 'grid'; items: GroupView[] } | { type: 'expanded'; group: GroupView })[] = [];
  for (const g of groups) {
    const last = segments[segments.length - 1];
    if (g.displayMode === 'expanded') segments.push({ type: 'expanded', group: g });
    else if (last?.type === 'grid') last.items.push(g);
    else segments.push({ type: 'grid', items: [g] });
  }
  const grid = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
  return (
    <div className="space-y-6">
      {segments.map((seg) =>
        seg.type === 'grid' ? (
          <div key={`grid-${seg.items[0].id}`} className={grid}>
            {seg.items.map((g) => (
              <GroupCard key={g.id} group={g} networks={networks} onOpen={() => onOpen({ kind: 'group', group: g })} />
            ))}
          </div>
        ) : (
          <div key={`exp-${seg.group.id}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: seg.group.color }} />
              <button type="button" onClick={() => onOpen({ kind: 'group', group: seg.group })} className="font-semibold text-noc-text hover:underline">
                {seg.group.name}
              </button>
              <span className="font-mono text-xs text-noc-muted">
                {seg.group.clients.total} Clients · ↓ {formatBps(seg.group.down)} · ↑ {formatBps(seg.group.up)}
              </span>
            </div>
            <div className={grid}>
              {seg.group.networkIds.map((id) =>
                networks[id] ? (
                  <NetworkCard key={id} network={networks[id]} accent={seg.group.color} onOpen={() => onOpen({ kind: 'network', network: networks[id] })} />
                ) : null,
              )}
            </div>
          </div>
        ),
      )}
      {ungrouped.length > 0 && (
        <div>
          {groups.length > 0 && <div className="mb-2 text-xs uppercase tracking-wider text-noc-muted">Einzelne Netzwerke</div>}
          <div className={grid}>
            {ungrouped.map((id) =>
              networks[id] ? <NetworkCard key={id} network={networks[id]} onOpen={() => onOpen({ kind: 'network', network: networks[id] })} /> : null,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
