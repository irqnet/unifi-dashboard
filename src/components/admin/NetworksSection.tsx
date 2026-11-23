'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, EyeOff, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/translate';
import type { AdminNetwork, AdminWan } from '@/lib/views';
import { GroupEditor, type AdminGroup, type GroupDraft } from './GroupEditor';
import { ColorDot, EmptyRow, Group, LinkButton, LoadingRow, PageHeader, Pill, PrimaryButton, Row, Switch, SwitchRow, TextInput, type Api } from './ui';

const EMPTY_DRAFT: GroupDraft = {
  name: '',
  description: '',
  color: '#38bdf8',
  displayMode: 'consolidated',
  anonymizeClients: false,
  hidden: false,
  networkIds: [],
};

const PURPOSE: Record<string, MessageKey> = {
  corporate: 'networks.purpose.corporate',
  guest: 'networks.purpose.guest',
  'vlan-only': 'networks.purpose.vlanOnly',
  wan: 'networks.purpose.wan',
  'remote-user-vpn': 'networks.purpose.vpn',
  'site-vpn': 'networks.purpose.siteVpn',
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
  const t = useT();
  const [networks, setNetworks] = useState<AdminNetwork[]>([]);
  const [wans, setWans] = useState<AdminWan[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [reorder, setReorder] = useState(false);

  const reload = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    const q = `?site=${encodeURIComponent(site)}`;
    const [n, g, w] = await Promise.all([
      api<{ networks: AdminNetwork[]; error: string | null }>(`/api/admin/networks${q}`),
      api<{ groups: AdminGroup[] }>(`/api/admin/groups${q}`),
      api<{ wans: AdminWan[] }>(`/api/admin/wans${q}`),
    ]);
    if (w.data) setWans(w.data.wans);
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

  const saveProvider = async (w: AdminWan, value: string) => {
    const provider = value.trim() || null;
    if (provider === w.provider) return;
    setWans((list) => list.map((x) => (x.key === w.key ? { ...x, provider } : x)));
    const res = await api('/api/admin/wans', { method: 'PUT', body: JSON.stringify({ site, key: w.key, provider: provider ?? '' }) });
    if (res.error) onError(res.error);
    else onChanged();
  };

  const saveQuota = async (w: AdminWan, quotaText: string, dayText: string) => {
    const q = Number.parseFloat(quotaText.replace(',', '.'));
    const quotaGb = Number.isFinite(q) && q > 0 ? Math.min(q, 1_000_000) : null;
    const d = Number.parseInt(dayText, 10);
    const cycleDay = Number.isInteger(d) ? Math.min(28, Math.max(1, d)) : 1;
    if (quotaGb === w.quotaGb && cycleDay === w.cycleDay) return;
    setWans((list) => list.map((x) => (x.key === w.key ? { ...x, quotaGb, cycleDay } : x)));
    const res = await api('/api/admin/wans', { method: 'PUT', body: JSON.stringify({ site, key: w.key, quotaGb, cycleDay }) });
    if (res.error) onError(res.error);
    else onChanged();
  };

  const netById = new Map(networks.map((n) => [n.id, n]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const editGroup = typeof editing === 'number' ? groups.find((g) => g.id === editing) : undefined;

  return (
    <>
      <PageHeader
        title={t('nav.networks')}
        lead={t('networks.lead')}
        action={
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('networks.group')}
          </PrimaryButton>
        }
      />

      <Group
        title={t('networks.groups')}
        aside={
          groups.length > 1 && (
            <LinkButton onClick={() => setReorder((r) => !r)}>{reorder ? t('common.done') : t('admin.reorder')}</LinkButton>
          )
        }
        footer={groups.length > 0 ? t('networks.orderHint') : undefined}
      >
        {loading && !groups.length && <LoadingRow />}
        {!loading && !groups.length && (
          <EmptyRow action={<LinkButton onClick={() => setEditing('new')}>{t('networks.createFirst')}</LinkButton>}>
            {t('networks.emptyHint')}
          </EmptyRow>
        )}
        {groups.map((g, idx) => {
          const names = g.networkIds.map((id) => {
            const n = netById.get(id);
            return n ? (n.vlan ? `${n.name} ${n.vlan}` : n.name) : t('networks.unknown');
          });
          const missing = g.networkIds.some((id) => !netById.has(id));
          return (
            <Row
              key={g.id}
              icon={<ColorDot color={g.color} />}
              title={g.name}
              subtitle={names.length ? names.join(', ') : t('networks.noneAssigned')}
              onClick={reorder ? undefined : () => setEditing(g.id)}
              chevron={!reorder}
              dim={g.hidden}
              detail={
                !reorder && (
                  <>
                    {missing && <Pill tone="danger">{t('networks.missing')}</Pill>}
                    {g.hidden && <Pill icon={<EyeOff className="h-3 w-3" />}>{t('admin.hidden')}</Pill>}
                    {g.anonymizeClients && <Pill tone="warn">{t('admin.anonymized')}</Pill>}
                    <span className="hidden sm:inline">{g.displayMode === 'consolidated' ? t('networks.consolidated') : t('networks.expanded')}</span>
                  </>
                )
              }
            >
              {reorder && (
                <div className="flex gap-1">
                  <ReorderButton label={t('admin.moveUp')} disabled={idx === 0} onClick={() => void move(idx, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </ReorderButton>
                  <ReorderButton label={t('admin.moveDown')} disabled={idx === groups.length - 1} onClick={() => void move(idx, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </ReorderButton>
                </div>
              )}
            </Row>
          );
        })}
      </Group>

      {wans.length > 0 && (
        <Group title={t('networks.wans')} footer={t('networks.wansFooter')}>
          {wans.map((w) => (
            <div key={w.key} className="flex flex-col gap-1.5 px-3.5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 sm:w-56 sm:pt-1.5">
                <div className="truncate font-medium text-noc-text">{w.name}</div>
                <div className="truncate text-[12px] text-noc-muted">
                  {w.key === 'WAN' ? 'WAN1' : w.key} · {w.detectedProvider ? t('networks.wanDetected', { provider: w.detectedProvider }) : t('networks.wanNotDetected')}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <TextInput
                  key={`${w.key}:${w.provider ?? ''}`}
                  aria-label={t('networks.wanProviderLabel', { name: w.name })}
                  placeholder={w.detectedProvider ?? t('networks.wanProvider')}
                  defaultValue={w.provider ?? ''}
                  maxLength={60}
                  className="min-w-0"
                  onBlur={(e) => void saveProvider(w, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-noc-muted"
                  onBlur={(e) => {
                    const box = e.currentTarget;
                    if (box.contains(e.relatedTarget as Node | null)) return;
                    const [q, d] = Array.from(box.querySelectorAll('input')).map((i) => i.value);
                    void saveQuota(w, q, d);
                  }}
                >
                  <span>{t('networks.wanQuota')}</span>
                  <span className="w-28">
                    <TextInput
                      key={`q${w.key}:${w.quotaGb ?? ''}`}
                      aria-label={t('networks.wanQuotaLabel', { name: w.name })}
                      inputMode="decimal"
                      placeholder={t('networks.wanQuotaNone')}
                      defaultValue={w.quotaGb ?? ''}
                      className="rounded-md border border-noc-line px-2"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  </span>
                  <span>{t('networks.wanQuotaUnit')}</span>
                  <span className="ml-2">{t('networks.wanCycleDay')}</span>
                  <span className="w-20">
                    <TextInput
                      key={`d${w.key}:${w.cycleDay}`}
                      aria-label={t('networks.wanCycleDayLabel', { name: w.name })}
                      type="number"
                      min={1}
                      max={28}
                      defaultValue={w.cycleDay}
                      className="rounded-md border border-noc-line px-2"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </Group>
      )}

      <Group title={t('networks.all')} aside={t('admin.liveFromController')}>
        {loading && !networks.length && <LoadingRow />}
        {!loading && !networks.length && <EmptyRow>{t('networks.noneFromController')}</EmptyRow>}
        {/* Phone: list instead of table */}
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
                <span className="truncate">{g ? g.name : t('networks.noGroup')}</span>
                <span className="ml-auto font-mono text-[12px]">{n.subnet ?? ''}</span>
              </div>
              <div className="mt-2.5 flex gap-6 text-[13px] text-noc-text">
                <span className="flex items-center gap-2">
                  <Switch label={t('networks.showLabel', { name: n.name })} checked={!n.hidden} onChange={(v) => void updateNetwork(n, { hidden: !v })} /> {t('networks.show')}
                </span>
                <span className="flex items-center gap-2">
                  <Switch label={t('networks.anonymizeLabel', { name: n.name })} checked={n.anonymizeClients} onChange={(v) => void updateNetwork(n, { anonymizeClients: v })} /> {t('networks.anonymous')}
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
                  <th className="px-3.5 py-2 font-medium">{t('common.name')}</th>
                  <th className="px-3 py-2 font-medium">VLAN</th>
                  <th className="px-3 py-2 font-medium">{t('networks.subnet')}</th>
                  <th className="px-3 py-2 font-medium">{t('networks.group')}</th>
                  <th className="w-24 px-3 py-2 text-center font-medium">{t('networks.show')}</th>
                  <th className="w-24 px-3.5 py-2 text-center font-medium">{t('networks.anonymous')}</th>
                </tr>
              </thead>
              <tbody className="[&>tr+tr]:border-t [&>tr+tr]:border-fg/[0.06]">
                {networks.map((n) => {
                  const g = n.groupId !== null ? groupById.get(n.groupId) : undefined;
                  return (
                    <tr key={n.id}>
                      <td className={clsx('px-3.5 py-2.5', n.hidden && 'opacity-55')}>
                        <div className="font-medium text-noc-text">{n.name}</div>
                        <div className="text-[12px] text-noc-muted">{PURPOSE[n.purpose] ? t(PURPOSE[n.purpose]) : n.purpose}</div>
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
                          <span className="text-noc-faint">{t('common.none')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Switch label={t('networks.showLabel', { name: n.name })} checked={!n.hidden} onChange={(v) => void updateNetwork(n, { hidden: !v })} />
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <Switch label={t('networks.anonymizeLabel', { name: n.name })} checked={n.anonymizeClients} onChange={(v) => void updateNetwork(n, { anonymizeClients: v })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Group>

      <Group footer={t('networks.ungroupedFooter')}>
        <SwitchRow title={t('networks.showUngrouped')} subtitle={t('networks.showUngroupedHint')} checked={showUngrouped} onChange={onShowUngrouped} />
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
