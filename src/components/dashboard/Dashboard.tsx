'use client';

import { AlertTriangle, Layers } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardPayload } from '@/lib/views';
import { SectionTitle } from '../ui/primitives';
import { DashboardHeader } from './DashboardHeader';
import { DetailDrawer } from './DetailDrawer';
import { HardwareSection } from './HardwareSection';
import { NetworkSection, type DetailTarget } from './NetworkCards';
import { WanPanel } from './WanPanel';

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

export type DashboardView = 'network' | 'hardware' | 'status';

export function Dashboard({
  defaultRefreshMs,
  view,
  endpoint,
}: {
  defaultRefreshMs: number;
  view: DashboardView;
  /** Abweichende Datenquelle (Statusseite: /api/status/<slug>) */
  endpoint?: string;
}) {
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
      const url = endpoint ?? `/api/unifi/dashboard${site ? `?site=${encodeURIComponent(site)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
      if (endpoint && (res.status === 401 || res.status === 403)) {
        // Statusseite: Server zeigt Login bzw. „Kein Zugriff“
        window.location.reload();
        return;
      }
      if (res.status === 401) {
        window.location.assign('/gate');
        return;
      }
      if (res.status === 404 && site && !endpoint) {
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
  }, [site, endpoint]);

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
        view={view}
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
            {view === 'network' && (
              <>
                <WanPanel data={data} />

            <section>
              <SectionTitle icon={<Layers className="h-4 w-4" />}>Netzwerke & VLAN-Gruppen</SectionTitle>
              <NetworkSection
                groups={data.groups}
                networks={data.networks}
                ungrouped={data.ungrouped}
                onOpen={(t) => setSelected(t.kind === 'group' ? { kind: 'group', id: t.group.id } : { kind: 'network', id: t.network.id })}
              />
            </section>

              </>
            )}
            {view === 'hardware' && <HardwareSection data={data} />}
            {view === 'status' && (
              <>
                {data.statusPage?.description && <p className="text-sm text-noc-muted">{data.statusPage.description}</p>}
                {data.statusPage?.showWan && <WanPanel data={data} />}
                {data.groups.length > 0 && (
                  <section>
                    <SectionTitle icon={<Layers className="h-4 w-4" />}>Netzwerke & VLAN-Gruppen</SectionTitle>
                    <NetworkSection
                      groups={data.groups}
                      networks={data.networks}
                      ungrouped={[]}
                      onOpen={(t) => setSelected(t.kind === 'group' ? { kind: 'group', id: t.group.id } : { kind: 'network', id: t.network.id })}
                    />
                  </section>
                )}
                {data.deviceGroups.length > 0 && <HardwareSection data={data} />}
                {!data.groups.length && !data.deviceGroups.length && !data.statusPage?.showWan && (
                  <div className="rounded-xl border border-dashed border-noc-line p-8 text-center text-sm text-noc-muted">
                    Dieser Statusseite sind noch keine Gruppen zugeordnet.
                  </div>
                )}
              </>
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
