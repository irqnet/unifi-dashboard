'use client';

import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveOrder, type TileLayout } from '@/lib/layout';
import type { DashboardPayload } from '@/lib/views';
import { DashboardHeader } from './DashboardHeader';
import { DetailDrawer } from './DetailDrawer';
import { EditBar } from './EditBar';
import { HardwareEmpty, hardwareTiles, hasHardware } from './HardwareSection';
import { kpiTiles } from './KpiTiles';
import { networkTiles, type DetailTarget } from './NetworkCards';
import { TileGrid, type TileDef, type TileSection } from './TileGrid';
import { useTileLayout } from './useTileLayout';
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraftState] = useState<TileLayout | null>(null);
  const [dirty, setDirty] = useState(false);
  const setDraft = useCallback((l: TileLayout) => {
    setDraftState(l);
    setDirty(true);
  }, []);
  const scope = view === 'status' ? `status:${endpoint?.split('/').pop() ?? ''}` : view;
  const tl = useTileLayout(scope);

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

  const open = useCallback((t: DetailTarget) => setSelected(t.kind === 'group' ? { kind: 'group', id: t.group.id } : { kind: 'network', id: t.network.id }), []);

  const tiles: TileDef[] = useMemo(() => {
    if (!data) return [];
    const kpis = kpiTiles(data).map((t) => ({ ...t, section: 'kpi' }));
    // WAN-Bereich: eine Kachel je Internetanbieter, nebeneinander
    const links = data.wans ?? [];
    const wanW = links.length >= 3 ? 4 : links.length === 2 ? 6 : 12;
    const wans: TileDef[] = links.map((l) => ({
      id: `wan:${l.key}`,
      title: links.length > 1 ? `WAN ${l.name}` : 'WAN-Durchsatz',
      w: wanW,
      h: 2,
      section: 'wan',
      fullBelowLg: true,
      render: () => <WanPanel wan={data.wan} link={links.length > 1 ? l : undefined} />,
    }));
    const inNet = (t: TileDef): TileDef => ({ ...t, section: 'net' });
    if (view === 'network') {
      return [...kpis, ...wans, ...networkTiles({ groups: data.groups, networks: data.networks, ungrouped: data.ungrouped, onOpen: open }).map(inNet)];
    }
    if (view === 'hardware') return [...kpis, ...hardwareTiles(data)];
    const showWan = !!data.statusPage?.showWan;
    const nets = networkTiles({ groups: data.groups, networks: data.networks, ungrouped: [], onOpen: open }).map(inNet);
    return [
      ...(showWan ? [...kpis, ...wans] : []),
      ...nets,
      ...(data.deviceGroups.length ? hardwareTiles(data).map((t) => ({ ...t, section: 'hw' })) : []),
    ];
  }, [data, view, open]);

  const sections: TileSection[] | undefined = useMemo(() => {
    if (view === 'hardware') return undefined;
    const multi = (data?.wans?.length ?? 0) > 1;
    const mode = data?.wans?.[0]?.mode;
    return [
      { id: 'kpi' },
      { id: 'wan', title: !multi ? 'WAN' : mode === 'failover' ? 'WAN · Failover' : mode === 'loadbalance' ? 'WAN · Loadbalancing' : 'WAN · Internetanbieter' },
      { id: 'net', title: 'Netzwerke' },
      ...(view === 'status' ? [{ id: 'hw', title: 'Hardware' }] : []),
    ];
  }, [view, data?.wans]);

  const active = editing && draft ? draft : tl.layout;
  const order = useMemo(() => resolveOrder(tiles.map((t) => t.id), active), [tiles, active]);

  const startEdit = () => {
    setDraftState({ ...tl.layout, order });
    setDirty(false);
    setEditing(true);
    setSelected(null);
  };
  const stopEdit = () => {
    setEditing(false);
    setDraftState(null);
  };

  const empty =
    data &&
    (view === 'network'
      ? !data.groups.length && !data.ungrouped.length
      : view === 'hardware'
        ? !hasHardware(data)
        : !data.groups.length && !data.deviceGroups.length && !data.statusPage?.showWan);

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
        editing={editing}
        onEdit={() => (editing ? stopEdit() : startEdit())}
      />

      <main className="mx-auto max-w-[1800px] space-y-4 px-3 pb-24 pt-3 sm:space-y-5 sm:px-4 sm:py-5 lg:px-6">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Verbindung zum UniFi Controller gestört</div>
              <div className="text-amber-200/80">{error}</div>
            </div>
          </div>
        )}

        {editing && draft && (
          <EditBar
            tiles={tiles}
            draft={draft}
            canSaveOwn={tl.canSaveOwn}
            canSaveDefault={tl.canSaveDefault}
            hasDefault={tl.hasDefault}
            error={tl.error}
            onChange={setDraft}
            onCancel={stopEdit}
            onDone={() => {
              // Nach „Zurücksetzen“ ohne weitere Änderung kein eigenes Layout anlegen
              if (dirty) void tl.save({ ...draft, order });
              stopEdit();
            }}
            onReset={() => {
              void tl.reset();
              setDraftState({ ...tl.defaultLayout });
              setDirty(false);
            }}
            onSaveDefault={() => {
              void tl.saveAsDefault({ ...draft, order });
              stopEdit();
            }}
            onClearDefault={() => void tl.clearDefault()}
          />
        )}

        {!data && !error && (
          <div className="tile-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="tile-cell h-40 animate-pulse rounded-xl border border-noc-line bg-noc-panel"
                style={{ ['--span-lg' as string]: 4, ['--span-sm' as string]: 3, ['--span-xs' as string]: 1, ['--rows' as string]: 2 }}
              />
            ))}
          </div>
        )}

        {data && view === 'status' && data.statusPage?.description && <p className="text-sm text-noc-muted">{data.statusPage.description}</p>}

        {data && <TileGrid tiles={tiles} sections={sections} order={order} layout={active} editing={editing} onChange={setDraft} />}

        {empty &&
          (view === 'hardware' ? (
            <HardwareEmpty />
          ) : (
            <div className="rounded-xl border border-dashed border-noc-line p-8 text-center text-sm text-noc-muted">
              {view === 'network'
                ? 'Keine Netzwerke freigegeben. Im Admin-Bereich können Gruppen angelegt oder nicht gruppierte VLANs eingeblendet werden.'
                : 'Dieser Statusseite sind noch keine Gruppen zugeordnet.'}
            </div>
          ))}
      </main>

      {detail && data && !editing && <DetailDrawer target={detail} networks={data.networks} onClose={() => setSelected(null)} onOpen={open} />}
    </>
  );
}
