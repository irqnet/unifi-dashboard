'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, Check, EyeOff, Loader2, Pencil, Plus, Radio, Router, Server, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AdminDevice } from '@/lib/views';
import { Button, Panel, SectionTitle, Toggle } from '../ui/primitives';

export interface AdminDeviceGroup {
  id: number;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  hidden: boolean;
  deviceMacs: string[];
}

type Draft = Omit<AdminDeviceGroup, 'id' | 'sortOrder'>;
const EMPTY: Draft = { name: '', description: '', color: '#38bdf8', hidden: false, deviceMacs: [] };
const PRESET_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb7185', '#2dd4bf', '#94a3b8'];

type Api = <T>(url: string, init?: RequestInit) => Promise<{ data?: T; error?: string }>;

function DeviceIcon({ type, className }: { type: AdminDevice['type']; className?: string }) {
  return type === 'switch' ? <Router className={className} /> : <Radio className={className} />;
}

function Editor({
  initial,
  devices,
  groups,
  onSave,
  onCancel,
}: {
  initial: Draft & { id?: number };
  devices: AdminDevice[];
  groups: AdminDeviceGroup[];
  onSave: (d: Draft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (mac: string) =>
    set('deviceMacs', draft.deviceMacs.includes(mac) ? draft.deviceMacs.filter((m) => m !== mac) : [...draft.deviceMacs, mac]);
  const q = filter.trim().toLowerCase();
  const shown = devices.filter((d) => !q || [d.name, d.model, d.mac, d.ip ?? ''].some((x) => x.toLowerCase().includes(q)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return setError('Bitte einen Namen angeben');
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-sky-500/40 bg-noc-panel p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-noc-muted">Name</label>
          <input className="w-full" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="z. B. Rack Keller" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-noc-muted">Beschreibung (optional)</label>
          <input className="w-full" value={draft.description} maxLength={300} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-noc-muted">Farbe</div>
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('color', c)}
                className={clsx('h-6 w-6 rounded-full ring-offset-2 ring-offset-noc-panel', draft.color === c && 'ring-2 ring-white')}
                style={{ background: c }}
                aria-label={`Farbe ${c}`}
              />
            ))}
            <input type="color" value={draft.color} onChange={(e) => set('color', e.target.value)} className="!h-7 !w-9 cursor-pointer !p-0.5" aria-label="Eigene Farbe" />
          </div>
        </div>
        <Toggle checked={draft.hidden} onChange={(v) => set('hidden', v)} label="Gruppe auf Statusseite verbergen" />
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-noc-muted">Zugeordnete Geräte ({draft.deviceMacs.length})</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtern nach Name, Modell, MAC, IP" className="!py-1 text-xs sm:w-64" />
        </div>
        <div className="grid max-h-72 gap-1.5 overflow-y-auto rounded-lg border border-noc-line bg-noc-bg p-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.length === 0 && <p className="p-2 text-sm text-noc-muted">Keine Geräte gefunden.</p>}
          {shown.map((d) => {
            const checked = draft.deviceMacs.includes(d.mac);
            const other = d.groupId !== null && d.groupId !== initial.id ? groups.find((g) => g.id === d.groupId)?.name : undefined;
            return (
              <button
                key={d.mac}
                type="button"
                onClick={() => toggle(d.mac)}
                className={clsx(
                  'flex items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition',
                  checked ? 'border-sky-500/60 bg-sky-500/10' : 'border-noc-line hover:border-slate-500',
                )}
              >
                <span className={clsx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-sky-400 bg-sky-500 text-slate-950' : 'border-noc-line')}>
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 truncate text-noc-text">
                    <DeviceIcon type={d.type} className="h-3.5 w-3.5 shrink-0 text-noc-muted" />
                    {d.name}
                    {!d.online && <span className="text-[10px] text-rose-300">offline</span>}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-noc-muted">
                    {d.model} · {d.mac}
                  </span>
                  {other && <span className="block text-[11px] text-amber-300/80">{checked ? 'wird verschoben aus' : 'aktuell in'} „{other}“</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4" /> Abbrechen
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Speichern
        </Button>
      </div>
    </form>
  );
}

export function DeviceGroups({
  site,
  api,
  showUngrouped,
  onShowUngrouped,
  reloadSignal,
  onError,
}: {
  site: string;
  api: Api;
  showUngrouped: boolean;
  onShowUngrouped: (v: boolean) => void;
  reloadSignal: number;
  onError: (e: string | null) => void;
}) {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [groups, setGroups] = useState<AdminDeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    const q = `?site=${encodeURIComponent(site)}`;
    const [d, g] = await Promise.all([
      api<{ devices: AdminDevice[] }>(`/api/admin/devices${q}`),
      api<{ groups: AdminDeviceGroup[] }>(`/api/admin/device-groups${q}`),
    ]);
    if (d.data) setDevices(d.data.devices);
    if (g.data) setGroups(g.data.groups);
    if (d.error || g.error) onError(d.error ?? g.error ?? null);
    setLoading(false);
  }, [site, api, onError]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  const save = async (id: number | 'new', draft: Draft) => {
    const res =
      id === 'new'
        ? await api('/api/admin/device-groups', { method: 'POST', body: JSON.stringify({ ...draft, site }) })
        : await api(`/api/admin/device-groups/${id}`, { method: 'PUT', body: JSON.stringify(draft) });
    if (res.error) return res.error;
    setEditing(null);
    await reload();
    return null;
  };

  const remove = async (id: number) => {
    const res = await api(`/api/admin/device-groups/${id}`, { method: 'DELETE' });
    if (res.error) onError(res.error);
    setConfirmDelete(null);
    await reload();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...groups];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setGroups(next);
    const res = await api<{ groups: AdminDeviceGroup[] }>('/api/admin/device-groups/order', {
      method: 'PUT',
      body: JSON.stringify({ site, ids: next.map((g) => g.id) }),
    });
    if (res.error) onError(res.error);
    else if (res.data) setGroups(res.data.groups);
  };

  const setHidden = async (g: AdminDeviceGroup, hidden: boolean) => {
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, hidden } : x)));
    const res = await api(`/api/admin/device-groups/${g.id}`, { method: 'PUT', body: JSON.stringify({ hidden }) });
    if (res.error) onError(res.error);
  };

  const byMac = new Map(devices.map((d) => [d.mac, d]));
  const ungroupedCount = devices.filter((d) => d.groupId === null).length;

  return (
    <section>
      <SectionTitle
        icon={<Server className="h-4 w-4" />}
        right={
          editing !== 'new' && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Neue Geräte-Gruppe
            </Button>
          )
        }
      >
        Geräte-Gruppen (Switche &amp; Access Points)
      </SectionTitle>
      <div className="space-y-3">
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-sm font-medium text-noc-text">Nicht gruppierte Geräte auf Statusseite anzeigen</div>
            <div className="text-xs text-noc-muted">
              {ungroupedCount} Gerät{ungroupedCount === 1 ? '' : 'e'} ohne Gruppe erscheinen unter „Switche“ bzw. „Access Points“.
            </div>
          </div>
          <Toggle checked={showUngrouped} onChange={onShowUngrouped} />
        </Panel>

        {editing === 'new' && <Editor initial={EMPTY} devices={devices} groups={groups} onSave={(d) => save('new', d)} onCancel={() => setEditing(null)} />}

        {!loading && !groups.length && editing !== 'new' && (
          <Panel className="border-dashed p-6 text-center text-sm text-noc-muted">
            Noch keine Geräte-Gruppen. Fasse z. B. „Rack Keller“, „Obergeschoss“ oder „Außenbereich“ zusammen.
          </Panel>
        )}

        {groups.map((g, idx) =>
          editing === g.id ? (
            <Editor key={g.id} initial={g} devices={devices} groups={groups} onSave={(d) => save(g.id, d)} onCancel={() => setEditing(null)} />
          ) : (
            <Panel key={g.id} className="relative overflow-hidden p-4">
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: g.color }} />
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => void move(idx, -1)} disabled={idx === 0} className="rounded p-0.5 text-noc-muted hover:bg-noc-raised hover:text-noc-text disabled:opacity-30" aria-label="Nach oben">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void move(idx, 1)} disabled={idx === groups.length - 1} className="rounded p-0.5 text-noc-muted hover:bg-noc-raised hover:text-noc-text disabled:opacity-30" aria-label="Nach unten">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-noc-text">{g.name}</h3>
                    {g.hidden && (
                      <span className="flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] text-rose-300">
                        <EyeOff className="h-3 w-3" /> verborgen
                      </span>
                    )}
                  </div>
                  {g.description && <p className="mt-0.5 text-sm text-noc-muted">{g.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.deviceMacs.length === 0 && <span className="text-xs text-noc-muted">Keine Geräte zugeordnet</span>}
                    {g.deviceMacs.map((mac) => {
                      const d = byMac.get(mac);
                      return (
                        <span
                          key={mac}
                          className={clsx(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ring-1 ring-inset',
                            d ? 'bg-noc-raised text-noc-text ring-noc-line' : 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
                          )}
                          title={d ? `${d.model} · ${mac}` : 'Gerät aktuell nicht im Controller'}
                        >
                          {d && <DeviceIcon type={d.type} className="h-3 w-3 text-noc-muted" />}
                          {d ? d.name : mac}
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
                        <Button variant="danger" onClick={() => void remove(g.id)}>
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
                  <Toggle checked={!g.hidden} onChange={(v) => void setHidden(g, !v)} label={<span className="text-xs">Sichtbar</span>} />
                </div>
              </div>
            </Panel>
          ),
        )}
      </div>
    </section>
  );
}
