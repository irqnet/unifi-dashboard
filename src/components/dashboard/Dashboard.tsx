'use client';

import { AlertTriangle, Layers, Radio, Router } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBps } from '@/lib/format';
import type { DashboardPayload } from '@/lib/views';
import { SectionTitle } from '../ui/primitives';
import { DashboardHeader } from './DashboardHeader';
import { DetailDrawer } from './DetailDrawer';
import { ApCard, SpeedLegend, SwitchCard } from './HardwareCards';
import { NetworkSection, type DetailTarget } from './NetworkCards';
import { TrafficChart } from './TrafficChart';

type Selected = { kind: 'group' | 'network'; id: string } | null;

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function Dashboard({ defaultRefreshMs }: { defaultRefreshMs: number }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [site, setSite] = useState<string>('');
  const [refreshMs, setRefreshMs] = useState(defaultRefreshMs);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSite(readPref('ud.site', ''));
    setRefreshMs(readPref('ud.refresh', defaultRefreshMs));
  }, [defaultRefreshMs]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(`/api/unifi/dashboard${site ? `?site=${encodeURIComponent(site)}` : ''}`, {
        cache: 'no-store',
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        window.location.assign('/gate');
        return;
      }
      if (res.status === 404 && site) {
        setSite('');
        writePref('ud.site', '');
        return;
      }
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      const payload = (await res.json()) as DashboardPayload;
      setData(payload);
      if (!site) setSite(payload.site);
      setFetchError(null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setFetchError((err as Error).message);
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, [site]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [load, refreshMs]);

  const detail: DetailTarget | null = useMemo(() => {
    if (!selected || !data) return null;
    if (selected.kind === 'group') {
      const g = data.groups.find((x) => x.id === selected.id);
      return g ? { kind: 'group', group: g } : null;
    }
    const n = data.networks[selected.id];
    return n ? { kind: 'network', network: n } : null;
  }, [selected, data]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.assign('/gate');
  };

  const error = fetchError ?? data?.error ?? null;

  return (
    <>
      <DashboardHeader
        data={data}
        site={site || data?.site || ''}
        onSite={(s) => {
          setSite(s);
          writePref('ud.site', s);
          setSelected(null);
        }}
        refreshMs={refreshMs}
        onRefresh={(ms) => {
          setRefreshMs(ms);
          writePref('ud.refresh', ms);
        }}
        loading={loading}
        onReload={() => void load()}
        onLogout={logout}
      />

      <main className="mx-auto max-w-[1800px] space-y-8 px-4 py-6 lg:px-6">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Verbindung zum UniFi Controller gestört</div>
              <div className="text-amber-200/80">{error}</div>
            </div>
          </div>
        )}

        {!data && !error && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl border border-noc-line bg-noc-panel" />
            ))}
          </div>
        )}

        {data && (
          <>
            <section className="rounded-xl border border-noc-line bg-noc-panel p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold uppercase tracking-wider text-noc-muted">WAN-Durchsatz</div>
                <div className="flex gap-4 font-mono text-xs tabular-nums">
                  <span className="text-noc-muted">
                    Clients <span className="text-noc-text">{data.totals.total}</span> ({data.totals.wired} LAN / {data.totals.wireless} WLAN)
                  </span>
                  <span className="text-sky-300">↓ {formatBps(data.wan.down)}</span>
                  <span className="text-violet-300">↑ {formatBps(data.wan.up)}</span>
                </div>
              </div>
              <TrafficChart id="wan" data={data.wan.history} height={140} />
            </section>

            <section>
              <SectionTitle icon={<Layers className="h-4 w-4" />}>Netzwerke & VLAN-Gruppen</SectionTitle>
              <NetworkSection
                groups={data.groups}
                networks={data.networks}
                ungrouped={data.ungrouped}
                onOpen={(t) => setSelected(t.kind === 'group' ? { kind: 'group', id: t.group.id } : { kind: 'network', id: t.network.id })}
              />
            </section>

            {data.switches.length > 0 && (
              <section>
                <SectionTitle icon={<Router className="h-4 w-4" />} right={<SpeedLegend />}>
                  Switche ({data.switches.filter((s) => s.online).length}/{data.switches.length} online)
                </SectionTitle>
                <div className="grid gap-3 xl:grid-cols-2">
                  {data.switches.map((sw) => (
                    <SwitchCard key={sw.id} sw={sw} />
                  ))}
                </div>
              </section>
            )}

            {data.aps.length > 0 && (
              <section>
                <SectionTitle icon={<Radio className="h-4 w-4" />}>
                  Access Points ({data.aps.filter((a) => a.online).length}/{data.aps.length} online)
                </SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {data.aps.map((ap) => (
                    <ApCard key={ap.id} ap={ap} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {detail && data && (
        <DetailDrawer
          target={detail}
          networks={data.networks}
          onClose={() => setSelected(null)}
          onOpen={(t) => setSelected(t.kind === 'group' ? { kind: 'group', id: t.group.id } : { kind: 'network', id: t.network.id })}
        />
      )}
    </>
  );
}
