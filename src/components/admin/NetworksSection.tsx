'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, EyeOff, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AdminNetwork } from '@/lib/views';
import { GroupEditor, type AdminGroup, type GroupDraft } from './GroupEditor';
import { ColorDot, EmptyRow, Group, LinkButton, LoadingRow, PageHeader, Pill, PrimaryButton, Row, Switch, SwitchRow, type Api } from './ui';

const EMPTY_DRAFT: GroupDraft = {
  name: '',
  description: '',
  color: '#38bdf8',
  displayMode: 'consolidated',
  anonymizeClients: false,
  hidden: false,
  networkIds: [],
};

const PURPOSE: Record<string, string> = {
  corporate: 'Firmennetz',
  guest: 'Gastnetz',
  'vlan-only': 'Nur VLAN',
  wan: 'WAN',
  'remote-user-vpn': 'VPN',
  'site-vpn': 'Site-VPN',
};

export function NetworksSection({
  site,
  api,
  reloadSignal,
  showUngrouped,
  onShowUngrouped,
  onError,
  onControllerError,
  onChanged,
}: {
  site: string;
  api: Api;
  reloadSignal: number;
  showUngrouped: boolean;
  onShowUngrouped: (v: boolean) => void;
  onError: (e: string | null) => void;
  onControllerError: (e: string | null) => void;
  onChanged: () => void;
}) {
  const [networks, setNetworks] = useState<AdminNetwork[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [reorder, setReorder] = useState(false);

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
      onControllerError(n.data.error);
    }
    if (g.data) setGroups(g.data.groups);
    if (n.error || g.error) onError(n.error ?? g.error ?? null);
    setLoading(false);
  }, [site, api, onError, onControllerError]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  const save = async (id: number | 'new', draft: GroupDraft): Promise<string | null> => {
    const res =
      id === 'new'
        ? await api('/api/admin/groups', { method: 'POST', body: JSON.stringify({ ...draft, site }) })
        : await api(`/api/admin/groups/${id}`, { method: 'PUT', body: JSON.stringify(draft) });
    if (res.error) return res.error;
    setEditing(null);
    await reload();
    onChanged();
    return null;
  };

  const remove = async (id: number) => {
    const res = await api(`/api/admin/groups/${id}`, { method: 'DELETE' });
    if (res.error) onError(res.error);
    setEditing(null);
    await reload();
    onChanged();
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
    if (res.error) onError(res.error);
    else if (res.data) setGroups(res.data.groups);
  };

  const updateNetwork = async (n: AdminNetwork, patch: Partial<Pick<AdminNetwork, 'hidden' | 'anonymizeClients'>>) => {
    const next = { ...n, ...patch };
    setNetworks((list) => list.map((x) => (x.id === n.id ? next : x)));
    const res = await api('/api/admin/networks', {
      method: 'PUT',
      body: JSON.stringify({ site, networkId: n.id, hidden: next.hidden, anonymizeClients: next.anonymizeClients }),
    });
    if (res.error) onError(res.error);
  };

  const netById = new Map(networks.map((n) => [n.id, n]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const editGroup = typeof editing === 'number' ? groups.find((g) => g.id === editing) : undefined;

  return (
    <>
      <PageHeader
        title="Netzwerke"
        lead="Fasse VLANs zu Gruppen zusammen und lege fest, was auf dem Dashboard erscheint."
        action={
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Gruppe
          </PrimaryButton>
        }
      />

      <Group
        title="Gruppen"
        aside={
          groups.length > 1 && (
            <LinkButton onClick={() => setReorder((r) => !r)}>{reorder ? 'Fertig' : 'Reihenfolge ändern'}</LinkButton>
          )
        }
        footer={groups.length > 0 ? 'In dieser Reihenfolge erscheinen die Gruppen auf dem Dashboard.' : undefined}
      >
        {loading && !groups.length && <LoadingRow />}
        {!loading && !groups.length && (
          <EmptyRow action={<LinkButton onClick={() => setEditing('new')}>Erste Gruppe anlegen</LinkButton>}>
            Fasse zusammengehörige VLANs wie „Gäste &amp; Nachbarn“ oder „Smart Home &amp; IoT“ zu einer Karte zusammen.
          </EmptyRow>
        )}
        {groups.map((g, idx) => {
          const names = g.networkIds.map((id) => {
            const n = netById.get(id);
            return n ? (n.vlan ? `${n.name} ${n.vlan}` : n.name) : 'Unbekanntes Netz';
          });
          const missing = g.networkIds.some((id) => !netById.has(id));
          return (
            <Row
              key={g.id}
              icon={<ColorDot color={g.color} />}
              title={g.name}
              subtitle={names.length ? names.join(', ') : 'Keine Netzwerke zugeordnet'}
              onClick={reorder ? undefined : () => setEditing(g.id)}
              chevron={!reorder}
              dim={g.hidden}
              detail={
                !reorder && (
                  <>
                    {missing && <Pill tone="danger">Netz fehlt</Pill>}
                    {g.hidden && <Pill icon={<EyeOff className="h-3 w-3" />}>ausgeblendet</Pill>}
                    {g.anonymizeClients && <Pill tone="warn">anonymisiert</Pill>}
                    <span className="hidden sm:inline">{g.displayMode === 'consolidated' ? 'Zusammengefasst' : 'Einzeln'}</span>
                  </>
                )
              }
            >
              {reorder && (
                <div className="flex gap-1">
                  <ReorderButton label="Nach oben" disabled={idx === 0} onClick={() => void move(idx, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </ReorderButton>
                  <ReorderButton label="Nach unten" disabled={idx === groups.length - 1} onClick={() => void move(idx, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </ReorderButton>
                </div>
              )}
            </Row>
          );
        })}
      </Group>

      <Group title="Alle Netzwerke" aside="live vom Controller">
        {loading && !networks.length && <LoadingRow />}
        {!loading && !networks.length && <EmptyRow>Der Controller hat keine Netzwerke geliefert.</EmptyRow>}
        {/* Handy: Liste statt Tabelle */}
        {networks.map((n) => {
          const g = n.groupId !== null ? groupById.get(n.groupId) : undefined;
          return (
            <div key={`m${n.id}`} className="px-3.5 py-3 sm:hidden">
              <div className={clsx('flex items-baseline justify-between gap-2', n.hidden && 'opacity-55')}>
                <span className="font-medium text-noc-text">{n.name}</span>
                <span className="font-mono text-[12px] text-noc-muted">{n.vlan ? `VLAN ${n.vlan}` : 'untagged'}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-noc-muted">
                {g && <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />}
                <span className="truncate">{g ? g.name : 'Keine Gruppe'}</span>
                <span className="ml-auto font-mono text-[12px]">{n.subnet ?? ''}</span>
              </div>
              <div className="mt-2.5 flex gap-6 text-[13px] text-noc-text">
                <span className="flex items-center gap-2">
                  <Switch label={`${n.name} anzeigen`} checked={!n.hidden} onChange={(v) => void updateNetwork(n, { hidden: !v })} /> Anzeigen
                </span>
                <span className="flex items-center gap-2">
                  <Switch label={`${n.name} anonymisieren`} checked={n.anonymizeClients} onChange={(v) => void updateNetwork(n, { anonymizeClients: v })} /> Anonym
                </span>
              </div>
            </div>
          );
        })}
        {networks.length > 0 && (
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-fg/[0.06] text-left text-[12px] text-noc-muted">
                  <th className="px-3.5 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">VLAN</th>
                  <th className="px-3 py-2 font-medium">Subnetz</th>
                  <th className="px-3 py-2 font-medium">Gruppe</th>
                  <th className="w-24 px-3 py-2 text-center font-medium">Anzeigen</th>
                  <th className="w-24 px-3.5 py-2 text-center font-medium">Anonym</th>
                </tr>
              </thead>
              <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-fg/[0.06]">
                {networks.map((n) => {
                  const g = n.groupId !== null ? groupById.get(n.groupId) : undefined;
                  return (
                    <tr key={n.id}>
                      <td className={clsx('px-3.5 py-2.5', n.hidden && 'opacity-55')}>
                        <div className="font-medium text-noc-text">{n.name}</div>
                        <div className="text-[12px] text-noc-muted">{PURPOSE[n.purpose] ?? n.purpose}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[12.5px] text-noc-muted">{n.vlan ?? '–'}</td>
                      <td className="px-3 py-2.5 font-mono text-[12.5px] text-noc-muted">{n.subnet ?? '–'}</td>
                      <td className="px-3 py-2.5 text-[13px]">
                        {g ? (
                          <span className="inline-flex items-center gap-1.5 text-noc-text">
                            <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                            {g.name}
                          </span>
                        ) : (
                          <span className="text-noc-faint">Keine</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Switch label={`${n.name} anzeigen`} checked={!n.hidden} onChange={(v) => void updateNetwork(n, { hidden: !v })} />
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <Switch label={`${n.name} anonymisieren`} checked={n.anonymizeClients} onChange={(v) => void updateNetwork(n, { anonymizeClients: v })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Group>

      <Group footer="Ausgeschaltet erscheinen nur Netzwerke, die einer Gruppe angehören.">
        <SwitchRow title="Netzwerke ohne Gruppe anzeigen" subtitle="Als einzelne Karten auf dem Dashboard." checked={showUngrouped} onChange={onShowUngrouped} />
      </Group>

      {editing === 'new' && (
        <GroupEditor isNew initial={EMPTY_DRAFT} networks={networks} groups={groups} onSave={(d) => save('new', d)} onCancel={() => setEditing(null)} />
      )}
      {editGroup && (
        <GroupEditor
          key={editGroup.id}
          isNew={false}
          initial={editGroup}
          networks={networks}
          groups={groups}
          onSave={(d) => save(editGroup.id, d)}
          onDelete={() => remove(editGroup.id)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

export function ReorderButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-md p-1.5 text-noc-muted hover:bg-fg/[0.06] hover:text-noc-text focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-25"
    >
      {children}
    </button>
  );
}
