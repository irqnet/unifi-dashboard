'use client';

import { ArrowDown, ArrowUp, EyeOff, Plus, Radio, Router, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/components/i18n/I18nProvider';
import type { AdminDevice } from '@/lib/views';
import { ReorderButton } from './NetworksSection';
import {
  CheckRow,
  ColorDot,
  ColorPicker,
  DeleteRow,
  EmptyRow,
  FieldRow,
  Group,
  LinkButton,
  LoadingRow,
  PageHeader,
  Pill,
  PrimaryButton,
  Row,
  Sheet,
  SwitchRow,
  TextInput,
  type Api,
} from './ui';

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

function DeviceIcon({ type, className }: { type: AdminDevice['type']; className?: string }) {
  return type === 'switch' ? <Router className={className} /> : <Radio className={className} />;
}

function Editor({
  initial,
  isNew,
  devices,
  groups,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: Draft & { id?: number };
  isNew: boolean;
  devices: AdminDevice[];
  groups: AdminDeviceGroup[];
  onSave: (d: Draft) => Promise<string | null>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (mac: string) =>
    set('deviceMacs', draft.deviceMacs.includes(mac) ? draft.deviceMacs.filter((m) => m !== mac) : [...draft.deviceMacs, mac]);
  const q = filter.trim().toLowerCase();
  const shown = devices.filter((d) => !q || [d.name, d.model, d.mac, d.ip ?? ''].some((x) => x.toLowerCase().includes(q)));

  async function submit() {
    if (!draft.name.trim()) return setError(t('groupEditor.nameRequired'));
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={isNew ? t('devices.new') : t('devices.edit')} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <Group>
        <FieldRow label={t('common.name')} htmlFor="dg-name">
          <TextInput id="dg-name" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder={t('devices.namePlaceholder')} />
        </FieldRow>
        <FieldRow label={t('common.description')} htmlFor="dg-desc">
          <TextInput id="dg-desc" value={draft.description} maxLength={300} onChange={(e) => set('description', e.target.value)} placeholder={t('common.optional')} />
        </FieldRow>
        <FieldRow label={t('common.color')}>
          <ColorPicker value={draft.color} onChange={(c) => set('color', c)} />
        </FieldRow>
      </Group>

      <Group title={t('admin.nav.devices')} aside={t('admin.selected', { count: draft.deviceMacs.length })}>
        <div className="flex items-center gap-2 px-3.5 py-2">
          <Search className="h-4 w-4 shrink-0 text-noc-muted" />
          <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('devices.searchPlaceholder')} aria-label={t('devices.filter')} />
        </div>
        {shown.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">{t('devices.noMatch')}</p>}
        {shown.map((d) => {
          const checked = draft.deviceMacs.includes(d.mac);
          const other = d.groupId !== null && d.groupId !== initial.id ? groups.find((g) => g.id === d.groupId)?.name : undefined;
          return (
            <CheckRow
              key={d.mac}
              checked={checked}
              onToggle={() => toggle(d.mac)}
              icon={<DeviceIcon type={d.type} className="h-4 w-4 shrink-0 text-noc-muted" />}
              title={
                <>
                  {d.name}
                  {!d.online && <span className="ml-1.5 text-[11px] text-rose-300">{t('common.offlineLower')}</span>}
                </>
              }
              subtitle={other ? (checked ? t('admin.movedFrom', { name: other }) : t('admin.currentlyIn', { name: other })) : d.model}
              detail={d.ip ?? undefined}
            />
          );
        })}
      </Group>

      <Group>
        <SwitchRow title={t('admin.showOnDashboard')} checked={!draft.hidden} onChange={(v) => set('hidden', !v)} />
      </Group>

      {!isNew && onDelete && (
        <DeleteRow
          label={t('devices.delete')}
          confirming={confirmDelete}
          onAsk={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete()}
          hint={t('devices.deleteHint')}
        />
      )}
    </Sheet>
  );
}

export function DeviceGroups({
  site,
  api,
  showUngrouped,
  onShowUngrouped,
  reloadSignal,
  onError,
  onChanged,
}: {
  site: string;
  api: Api;
  showUngrouped: boolean;
  onShowUngrouped: (v: boolean) => void;
  reloadSignal: number;
  onError: (e: string | null) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [groups, setGroups] = useState<AdminDeviceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [reorder, setReorder] = useState(false);

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
    onChanged();
    return null;
  };

  const remove = async (id: number) => {
    const res = await api(`/api/admin/device-groups/${id}`, { method: 'DELETE' });
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
    const res = await api<{ groups: AdminDeviceGroup[] }>('/api/admin/device-groups/order', {
      method: 'PUT',
      body: JSON.stringify({ site, ids: next.map((g) => g.id) }),
    });
    if (res.error) onError(res.error);
    else if (res.data) setGroups(res.data.groups);
  };

  const byMac = new Map(devices.map((d) => [d.mac, d]));
  const ungrouped = devices.filter((d) => d.groupId === null);
  const editGroup = typeof editing === 'number' ? groups.find((g) => g.id === editing) : undefined;

  return (
    <>
      <PageHeader
        title={t('admin.nav.devices')}
        lead={t('devices.lead')}
        action={
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('networks.group')}
          </PrimaryButton>
        }
      />

      <Group
        title={t('networks.groups')}
        aside={groups.length > 1 && <LinkButton onClick={() => setReorder((r) => !r)}>{reorder ? t('common.done') : t('admin.reorder')}</LinkButton>}
        footer={groups.length > 0 ? t('devices.orderHint') : undefined}
      >
        {loading && !groups.length && <LoadingRow />}
        {!loading && !groups.length && (
          <EmptyRow action={<LinkButton onClick={() => setEditing('new')}>{t('networks.createFirst')}</LinkButton>}>
            {t('devices.emptyHint')}
          </EmptyRow>
        )}
        {groups.map((g, idx) => {
          const names = g.deviceMacs.map((mac) => byMac.get(mac)?.name ?? mac);
          const offline = g.deviceMacs.filter((mac) => byMac.get(mac) && !byMac.get(mac)!.online).length;
          return (
            <Row
              key={g.id}
              icon={<ColorDot color={g.color} />}
              title={g.name}
              subtitle={names.length ? names.join(', ') : t('devices.noneAssigned')}
              onClick={reorder ? undefined : () => setEditing(g.id)}
              chevron={!reorder}
              dim={g.hidden}
              detail={
                !reorder && (
                  <>
                    {offline > 0 && <Pill tone="danger">{offline} offline</Pill>}
                    {g.hidden && <Pill icon={<EyeOff className="h-3 w-3" />}>{t('admin.hidden')}</Pill>}
                    <span className="hidden sm:inline">
                      {t('devices.count', { count: g.deviceMacs.length })}
                    </span>
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

      {ungrouped.length > 0 && (
        <Group title={t('devices.ungrouped')} aside={t('devices.count', { count: ungrouped.length })}>
          {ungrouped.map((d) => (
            <Row
              key={d.mac}
              icon={
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fg/[0.06]">
                  <DeviceIcon type={d.type} className="h-3.5 w-3.5 text-noc-muted" />
                </span>
              }
              title={d.name}
              subtitle={d.model}
              detail={
                <>
                  {!d.online && <Pill tone="danger">{t('common.offlineLower')}</Pill>}
                  <span className="hidden font-mono text-[12px] sm:inline">{d.ip ?? ''}</span>
                </>
              }
            />
          ))}
        </Group>
      )}

      <Group footer={t('devices.ungroupedFooter')}>
        <SwitchRow title={t('devices.showUngrouped')} subtitle={t('devices.showUngroupedHint')} checked={showUngrouped} onChange={onShowUngrouped} />
      </Group>

      {editing === 'new' && <Editor isNew initial={EMPTY} devices={devices} groups={groups} onSave={(d) => save('new', d)} onCancel={() => setEditing(null)} />}
      {editGroup && (
        <Editor
          key={editGroup.id}
          isNew={false}
          initial={editGroup}
          devices={devices}
          groups={groups}
          onSave={(d) => save(editGroup.id, d)}
          onDelete={() => remove(editGroup.id)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}
