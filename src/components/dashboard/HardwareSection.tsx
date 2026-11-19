'use client';

import { Radio, Router } from 'lucide-react';
import type { ApView, DashboardPayload, SwitchView } from '@/lib/views';
import { ApCard, SpeedLegend, SwitchCard } from './HardwareCards';
import type { TileDef } from './TileGrid';

// Raster richten sich nach der Kachelbreite (Container Queries), nicht nach dem Bildschirm
function SwitchGrid({ items }: { items: SwitchView[] }) {
  return (
    <div className="grid gap-3 @4xl:grid-cols-2">
      {items.map((sw) => (
        <SwitchCard key={sw.id} sw={sw} />
      ))}
    </div>
  );
}

function ApGrid({ items }: { items: ApView[] }) {
  return (
    <div className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4">
      {items.map((ap) => (
        <ApCard key={ap.id} ap={ap} />
      ))}
    </div>
  );
}

const online = (list: { online: boolean }[]) => `${list.filter((d) => d.online).length}/${list.length} online`;

function HardwareTile({ color, title, meta, legend, children }: { color?: string; title: React.ReactNode; meta?: React.ReactNode; legend?: boolean; children: React.ReactNode }) {
  return (
    <section className="tile-shadow h-full rounded-xl border border-noc-line bg-noc-panel/60 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
        <h3 className="font-semibold text-noc-text">{title}</h3>
        {meta}
        {legend && (
          <div className="ml-auto hidden @3xl:block">
            <SpeedLegend />
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function hasHardware(data: DashboardPayload) {
  return data.deviceGroups.length > 0 || data.ungroupedSwitches.length > 0 || data.ungroupedAps.length > 0;
}

export function HardwareEmpty() {
  return (
    <div className="rounded-xl border border-dashed border-noc-line p-8 text-center text-sm text-noc-muted">
      Keine Switche oder Access Points zur Anzeige. Prüfe im Admin-Bereich die Geräte-Gruppen und die Option für nicht gruppierte Geräte.
    </div>
  );
}

/** Hardware als Kacheln: je Admin-Geräte-Gruppe eine, danach nicht gruppierte Switche und Access Points. */
export function hardwareTiles(data: DashboardPayload): TileDef[] {
  const swById = new Map(data.switches.map((s) => [s.id, s]));
  const apById = new Map(data.aps.map((a) => [a.id, a]));
  const ungroupedSw = data.ungroupedSwitches.map((id) => swById.get(id)).filter((x): x is SwitchView => !!x);
  const ungroupedAp = data.ungroupedAps.map((id) => apById.get(id)).filter((x): x is ApView => !!x);
  const hasGroups = data.deviceGroups.length > 0;
  const tiles: TileDef[] = [];
  let legendShown = false;
  const legend = () => {
    if (legendShown) return false;
    legendShown = true;
    return true;
  };

  for (const g of data.deviceGroups) {
    const sws = g.switchIds.map((id) => swById.get(id)).filter((x): x is SwitchView => !!x);
    const aps = g.apIds.map((id) => apById.get(id)).filter((x): x is ApView => !!x);
    const all = [...sws, ...aps];
    const offline = all.filter((d) => !d.online).length;
    const showLegend = sws.length > 0 && legend();
    tiles.push({
      id: `hw:${g.id}`,
      title: g.name,
      w: 12,
      h: 2,
      render: () => (
        <HardwareTile
          color={g.color}
          title={g.name}
          legend={showLegend}
          meta={
            <>
              <span className={offline ? 'text-xs text-rose-300' : 'text-xs text-noc-muted'}>{online(all)}</span>
              {sws.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-noc-muted">
                  <Router className="h-3 w-3" /> {sws.length}
                </span>
              )}
              {aps.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-noc-muted">
                  <Radio className="h-3 w-3" /> {aps.length}
                </span>
              )}
              {g.description && <span className="text-xs text-noc-muted">· {g.description}</span>}
            </>
          }
        >
          <div className="space-y-3">
            {sws.length > 0 && <SwitchGrid items={sws} />}
            {aps.length > 0 && <ApGrid items={aps} />}
          </div>
        </HardwareTile>
      ),
    });
  }

  if (ungroupedSw.length > 0) {
    const showLegend = legend();
    tiles.push({
      id: 'hw:switches',
      title: hasGroups ? 'Weitere Switche' : 'Switche',
      w: 12,
      h: 2,
      render: () => (
        <HardwareTile
          title={
            <span className="flex items-center gap-2">
              <Router className="h-4 w-4 text-noc-muted" /> {hasGroups ? 'Weitere Switche' : 'Switche'}
            </span>
          }
          meta={<span className="text-xs text-noc-muted">{online(ungroupedSw)}</span>}
          legend={showLegend}
        >
          <SwitchGrid items={ungroupedSw} />
        </HardwareTile>
      ),
    });
  }

  if (ungroupedAp.length > 0) {
    tiles.push({
      id: 'hw:aps',
      title: hasGroups ? 'Weitere Access Points' : 'Access Points',
      w: 12,
      h: 2,
      render: () => (
        <HardwareTile
          title={
            <span className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-noc-muted" /> {hasGroups ? 'Weitere Access Points' : 'Access Points'}
            </span>
          }
          meta={<span className="text-xs text-noc-muted">{online(ungroupedAp)}</span>}
        >
          <ApGrid items={ungroupedAp} />
        </HardwareTile>
      ),
    });
  }
  return tiles;
}
