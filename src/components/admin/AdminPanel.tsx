'use client';

import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  LogOut,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  ShieldOff,
  Trash2,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminNetwork, SiteInfo } from '@/lib/views';
import { Button, Panel, SectionTitle, Toggle } from '../ui/primitives';
import { DeviceGroups } from './DeviceGroups';
import { GroupEditor, type AdminGroup, type GroupDraft } from './GroupEditor';

const EMPTY_DRAFT: GroupDraft = {
  name: '',
  description: '',
  color: '#38bdf8',
  displayMode: 'consolidated',
  anonymizeClients: false,
  hidden: false,
  networkIds: [],
};

async function api<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      window.location.assign('/admin/login');
      return { error: 'Sitzung abgelaufen' };
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { data: json };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export function AdminPanel() {
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [site, setSite] = useState('');
  const [networks, setNetworks] = useState<AdminNetwork[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [showUngrouped, setShowUngrouped] = useState(true);
  const [showUngroupedDevices, setShowUngroupedDevices] = useState(true);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [controllerError, setControllerError] = useState<string | null>(null);
  const [dbWarning, setDbWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, st] = await Promise.all([
        api<{ sites: SiteInfo[] }>('/api/unifi/sites'),
        api<{ settings: { showUngrouped: boolean; showUngroupedDevices: boolean }; db?: { persistent: boolean; path: string; error: string | null } }>('/api/admin/settings'),
      ]);
      if (s.data) {
        setSites(s.data.sites);
        setSite((cur) => cur || s.data!.sites[0]?.name || 'default');
      }
      if (st.data) {
        setShowUngrouped(st.data.settings.showUngrouped);
        setShowUngroupedDevices(st.data.settings.showUngroupedDevices);
        if (st.data.db && !st.data.db.persistent) {
          setDbWarning(`Datenbank ${st.data.db.path} ist nicht beschreibbar (${st.data.db.error}). Änderungen gehen beim Neustart verloren.`);
        }
      }
      if (s.error || st.error) setError(s.error ?? st.error ?? null);
    })();
  }, []);

  const reload = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    const q = `?site=${encodeURIComponent(site)}`;
    const [n, g] = await Promise.all([
      api<{ networks: AdminNetwork[]; error: string | null }>(`/api/admin/networks${q}`),
      api<{ groups: AdminGroup[] }>(`/api/admin/groups${q}`),
    ]);
    if (n.data) {
      setNetworks(n.data.networks);
      setControllerError(n.data.error);
    }
    if (g.data) setGroups(g.data.groups);
    setError(n.error ?? g.error ?? null);
    setLoading(false);
  }, [site]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveGroup = async (id: number | 'new', draft: GroupDraft): Promise<string | null> => {
    const res =
      id === 'new'
        ? await api('/api/admin/groups', { method: 'POST', body: JSON.stringify({ ...draft, site }) })
        : await api(`/api/admin/groups/${id}`, { method: 'PUT', body: JSON.stringify(draft) });
    if (res.error) return res.error;
    setEditing(null);
    await reload();
    return null;
  };

  const removeGroup = async (id: number) => {
    const res = await api(`/api/admin/groups/${id}`, { method: 'DELETE' });
    if (res.error) setError(res.error);
    setConfirmDelete(null);
    await reload();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...groups];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setGroups(next);
    const res = await api<{ groups: AdminGroup[] }>('/api/admin/groups/order', {
      method: 'PUT',
      body: JSON.stringify({ site, ids: next.map((g) => g.id) }),
    });
    if (res.error) setError(res.error);
    else if (res.data) setGroups(res.data.groups);
  };

  const quickToggle = async (g: AdminGroup, patch: Partial<GroupDraft>) => {
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, ...patch } : x)));
    const res = await api(`/api/admin/groups/${g.id}`, { method: 'PUT', body: JSON.stringify(patch) });
    if (res.error) {
      setError(res.error);
      await reload();
    }
  };

  const updateNetwork = async (n: AdminNetwork, patch: Partial<Pick<AdminNetwork, 'hidden' | 'anonymizeClients'>>) => {
    const next = { ...n, ...patch };
    setNetworks((list) => list.map((x) => (x.id === n.id ? next : x)));
    const res = await api('/api/admin/networks', {
      method: 'PUT',
      body: JSON.stringify({ site, networkId: n.id, hidden: next.hidden, anonymizeClients: next.anonymizeClients }),
    });
    if (res.error) setError(res.error);
  };

  const updateShowUngrouped = async (v: boolean) => {
    setShowUngrouped(v);
    const res = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ showUngrouped: v }) });
    if (res.error) setError(res.error);
  };

  const updateShowUngroupedDevices = async (v: boolean) => {
    setShowUngroupedDevices(v);
    const res = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ showUngroupedDevices: v }) });
    if (res.error) setError(res.error);
  };

  const dropAdmin = async () => {
    await fetch('/api/auth/admin', { method: 'DELETE' }).catch(() => null);
    window.location.assign('/');
  };
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.assign('/gate');
  };

  const netById = new Map(networks.map((n) => [n.id, n]));
  const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-noc-line bg-noc-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-noc-muted hover:text-noc-text">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div className="h-5 w-px bg-noc-line" />
          <h1 className="font-semibold text-noc-text">Admin-Bereich</h1>
          <select value={site} onChange={(e) => setSite(e.target.value)} className="!py-1 text-sm" aria-label="Standort">
            {sites.map((s) => (
              <option key={s.name} value={s.name}>
                {s.desc}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                void reload();
                setReloadSignal((n) => n + 1);
              }}
              title="Neu laden"
            >
              <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
            </Button>
            <Button variant="secondary" onClick={dropAdmin} title="Admin-Rechte abgeben">
              <ShieldOff className="h-4 w-4" /> <span className="hidden sm:inline">Admin beenden</span>
            </Button>
            <Button variant="ghost" onClick={logout} title="Abmelden">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        {dbWarning && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{dbWarning}</div>
          </div>
        )}
        {(error || controllerError) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error ?? `UniFi Controller: ${controllerError}`}</div>
          </div>
        )}

        {/* ---------------- Gruppen ---------------- */}
        <section>
          <SectionTitle
            icon={<Layers className="h-4 w-4" />}
            right={
              editing !== 'new' && (
                <Button variant="primary" onClick={() => setEditing('new')}>
                  <Plus className="h-4 w-4" /> Neue Gruppe
                </Button>
              )
            }
          >
            Netzwerk-Gruppen
          </SectionTitle>

          <div className="space-y-3">
            {editing === 'new' && (
              <GroupEditor initial={EMPTY_DRAFT} networks={networks} groups={groups} onSave={(d) => saveGroup('new', d)} onCancel={() => setEditing(null)} />
            )}

            {loading && !groups.length && (
              <div className="flex items-center gap-2 text-sm text-noc-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Lade …
              </div>
            )}

            {!loading && !groups.length && editing !== 'new' && (
              <Panel className="border-dashed p-6 text-center text-sm text-noc-muted">
                Noch keine Gruppen angelegt. Fasse z. B. „Gäste &amp; Nachbarn“ oder „Smart Home &amp; IoT“ zu einer konsolidierten Ansicht zusammen.
              </Panel>
            )}

            {groups.map((g, idx) =>
              editing === g.id ? (
                <GroupEditor key={g.id} initial={g} networks={networks} groups={groups} onSave={(d) => saveGroup(g.id, d)} onCancel={() => setEditing(null)} />
              ) : (
                <Panel key={g.id} className="relative overflow-hidden p-4">
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: g.color }} />
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => void move(idx, -1)}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-noc-muted hover:bg-noc-raised hover:text-noc-text disabled:opacity-30"
                        aria-label="Nach oben"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void move(idx, 1)}
                        disabled={idx === groups.length - 1}
                        className="rounded p-0.5 text-noc-muted hover:bg-noc-raised hover:text-noc-text disabled:opacity-30"
                        aria-label="Nach unten"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-noc-text">{g.name}</h3>
                        <span className="rounded bg-noc-raised px-1.5 py-0.5 text-[11px] text-noc-muted ring-1 ring-inset ring-noc-line">
                          {g.displayMode === 'consolidated' ? 'Konsolidiert' : 'Einzelkarten'}
                        </span>
                        {g.hidden && (
                          <span className="flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] text-rose-300">
                            <EyeOff className="h-3 w-3" /> verborgen
                          </span>
                        )}
                        {g.anonymizeClients && (
                          <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
                            <UserX className="h-3 w-3" /> anonymisiert
                          </span>
                        )}
                      </div>
                      {g.description && <p className="mt-0.5 text-sm text-noc-muted">{g.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {g.networkIds.length === 0 && <span className="text-xs text-noc-muted">Keine Netzwerke zugeordnet</span>}
                        {g.networkIds.map((id) => {
                          const n = netById.get(id);
                          return (
                            <span
                              key={id}
                              className={clsx(
                                'rounded-md px-2 py-0.5 text-xs ring-1 ring-inset',
                                n ? 'bg-noc-raised text-noc-text ring-noc-line' : 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
                              )}
                              title={n ? n.subnet ?? '' : 'Netzwerk existiert im Controller nicht mehr'}
                            >
                              {n ? n.name : `Unbekannt (${id.slice(0, 8)}…)`}
                              {n && <span className="ml-1 font-mono text-noc-muted">{n.vlan ?? '–'}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" onClick={() => setEditing(g.id)} title="Bearbeiten">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {confirmDelete === g.id ? (
                          <>
                            <Button variant="danger" onClick={() => void removeGroup(g.id)}>
                              Löschen bestätigen
                            </Button>
                            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                              Abbrechen
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" onClick={() => setConfirmDelete(g.id)} title="Löschen">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <Toggle checked={!g.hidden} onChange={(v) => void quickToggle(g, { hidden: !v })} label={<span className="text-xs">Sichtbar</span>} />
                      <Toggle
                        checked={g.anonymizeClients}
                        onChange={(v) => void quickToggle(g, { anonymizeClients: v })}
                        label={<span className="text-xs">Anonymisieren</span>}
                      />
                    </div>
                  </div>
                </Panel>
              ),
            )}
          </div>
        </section>

        {/* ---------------- Netzwerke ---------------- */}
        <section>
          <SectionTitle icon={<Network className="h-4 w-4" />}>Netzwerke & VLANs (live vom Controller)</SectionTitle>
          <Panel className="mb-3 flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-medium text-noc-text">Nicht gruppierte VLANs auf Statusseite anzeigen</div>
              <div className="text-xs text-noc-muted">Netzwerke ohne Gruppe erscheinen als einzelne Karten auf dem Dashboard.</div>
            </div>
            <Toggle checked={showUngrouped} onChange={(v) => void updateShowUngrouped(v)} />
          </Panel>
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-line text-left text-[11px] uppercase tracking-wider text-noc-muted">
                  <th className="px-4 py-2.5 font-medium">Netzwerk</th>
                  <th className="px-4 py-2.5 font-medium">VLAN</th>
                  <th className="px-4 py-2.5 font-medium">Subnetz</th>
                  <th className="px-4 py-2.5 font-medium">Gruppe</th>
                  <th className="px-4 py-2.5 font-medium">Auf Statusseite</th>
                  <th className="px-4 py-2.5 font-medium">Hostnamen anonymisieren</th>
                </tr>
              </thead>
              <tbody>
                {networks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-noc-muted">
                      {loading ? 'Lade Netzwerke …' : 'Keine Netzwerke gefunden.'}
                    </td>
                  </tr>
                )}
                {networks.map((n) => (
                  <tr key={n.id} className="border-b border-noc-line/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-noc-text">{n.name}</div>
                      <div className="text-[11px] text-noc-muted">{n.purpose}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-noc-muted">{n.vlan ?? 'untagged'}</td>
                    <td className="px-4 py-2.5 font-mono text-noc-muted">{n.subnet ?? '–'}</td>
                    <td className="px-4 py-2.5 text-noc-muted">{groupName(n.groupId) ?? <span className="opacity-60">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <Toggle
                        checked={!n.hidden}
                        onChange={(v) => void updateNetwork(n, { hidden: !v })}
                        label={n.hidden ? <EyeOff className="h-3.5 w-3.5 text-noc-muted" /> : <Eye className="h-3.5 w-3.5 text-noc-muted" />}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Toggle checked={n.anonymizeClients} onChange={(v) => void updateNetwork(n, { anonymizeClients: v })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>

        {/* ---------------- Geräte-Gruppen ---------------- */}
        <DeviceGroups
          site={site}
          api={api}
          showUngrouped={showUngroupedDevices}
          onShowUngrouped={(v) => void updateShowUngroupedDevices(v)}
          reloadSignal={reloadSignal}
          onError={setError}
        />
      </main>
    </div>
  );
}
