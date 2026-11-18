'use client';

import { Radio, Router, Server } from 'lucide-react';
import type { ApView, DashboardPayload, SwitchView } from '@/lib/views';
import { SectionTitle } from '../ui/primitives';
import { ApCard, SpeedLegend, SwitchCard } from './HardwareCards';

function SwitchGrid({ items }: { items: SwitchView[] }) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {items.map((sw) => (
        <SwitchCard key={sw.id} sw={sw} />
      ))}
    </div>
  );
}

function ApGrid({ items }: { items: ApView[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((ap) => (
        <ApCard key={ap.id} ap={ap} />
      ))}
    </div>
  );
}

const online = (list: { online: boolean }[]) => `${list.filter((d) => d.online).length}/${list.length} online`;

/** Hardware nach Admin-Geräte-Gruppen, danach nicht gruppierte Switche und Access Points. */
export function HardwareSection({ data }: { data: DashboardPayload }) {
  const swById = new Map(data.switches.map((s) => [s.id, s]));
  const apById = new Map(data.aps.map((a) => [a.id, a]));
  const ungroupedSw = data.ungroupedSwitches.map((id) => swById.get(id)).filter((x): x is SwitchView => !!x);
  const ungroupedAp = data.ungroupedAps.map((id) => apById.get(id)).filter((x): x is ApView => !!x);
  const hasGroups = data.deviceGroups.length > 0;
  if (!hasGroups && !ungroupedSw.length && !ungroupedAp.length) return null;

  return (
    <>
      {hasGroups && (
        <section>
          <SectionTitle icon={<Server className="h-4 w-4" />} right={<SpeedLegend />}>
            Netzwerk-Hardware
          </SectionTitle>
          <div className="space-y-6">
            {data.deviceGroups.map((g) => {
              const sws = g.switchIds.map((id) => swById.get(id)).filter((x): x is SwitchView => !!x);
              const aps = g.apIds.map((id) => apById.get(id)).filter((x): x is ApView => !!x);
              const all = [...sws, ...aps];
              const offline = all.filter((d) => !d.online).length;
              return (
                <div key={g.id} className="rounded-xl border border-noc-line/60 bg-noc-panel/30 p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                    <h3 className="font-semibold text-noc-text">{g.name}</h3>
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
                  </div>
                  <div className="space-y-3">
                    {sws.length > 0 && <SwitchGrid items={sws} />}
                    {aps.length > 0 && <ApGrid items={aps} />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {ungroupedSw.length > 0 && (
        <section>
          <SectionTitle icon={<Router className="h-4 w-4" />} right={hasGroups ? undefined : <SpeedLegend />}>
            {hasGroups ? 'Weitere Switche' : 'Switche'} ({online(ungroupedSw)})
          </SectionTitle>
          <SwitchGrid items={ungroupedSw} />
        </section>
      )}

      {ungroupedAp.length > 0 && (
        <section>
          <SectionTitle icon={<Radio className="h-4 w-4" />}>
            {hasGroups ? 'Weitere Access Points' : 'Access Points'} ({online(ungroupedAp)})
          </SectionTitle>
          <ApGrid items={ungroupedAp} />
        </section>
      )}
    </>
  );
}
