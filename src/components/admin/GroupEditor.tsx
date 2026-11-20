'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/I18nProvider';
import type { AdminNetwork } from '@/lib/views';
import { CheckRow, ColorPicker, DeleteRow, FieldRow, Group, Segmented, Sheet, SwitchRow, TextInput } from './ui';

export interface AdminGroup {
  id: number;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  displayMode: 'consolidated' | 'expanded';
  anonymizeClients: boolean;
  hidden: boolean;
  networkIds: string[];
}

export type GroupDraft = Omit<AdminGroup, 'id' | 'sortOrder'>;

export function GroupEditor({
  initial,
  isNew,
  networks,
  groups,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: GroupDraft & { id?: number };
  isNew: boolean;
  networks: AdminNetwork[];
  groups: AdminGroup[];
  onSave: (draft: GroupDraft) => Promise<string | null>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<GroupDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof GroupDraft>(k: K, v: GroupDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name;

  const toggleNet = (id: string) =>
    set('networkIds', draft.networkIds.includes(id) ? draft.networkIds.filter((x) => x !== id) : [...draft.networkIds, id]);

  async function submit() {
    if (!draft.name.trim()) return setError(t('groupEditor.nameRequired'));
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={isNew ? t('groupEditor.new') : t('groupEditor.edit')} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <Group>
        <FieldRow label={t('common.name')} htmlFor="grp-name">
          <TextInput id="grp-name" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder={t('groupEditor.namePlaceholder')} />
        </FieldRow>
        <FieldRow label={t('common.description')} htmlFor="grp-desc">
          <TextInput id="grp-desc" value={draft.description} maxLength={300} onChange={(e) => set('description', e.target.value)} placeholder={t('common.optional')} />
        </FieldRow>
        <FieldRow label={t('common.color')}>
          <ColorPicker value={draft.color} onChange={(c) => set('color', c)} />
        </FieldRow>
        <FieldRow label={t('groupEditor.display')}>
          <Segmented
            value={draft.displayMode}
            options={[
              ['consolidated', t('networks.consolidated')],
              ['expanded', t('groupEditor.perVlan')],
            ]}
            onChange={(v) => set('displayMode', v)}
          />
        </FieldRow>
      </Group>

      <Group title={t('nav.networks')} aside={t('admin.selected', { count: draft.networkIds.length })}>
        {networks.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">{t('groupEditor.noNetworks')}</p>}
        {networks.map((n) => {
          const checked = draft.networkIds.includes(n.id);
          const other = n.groupId !== null && n.groupId !== initial.id ? groupName(n.groupId) : undefined;
          return (
            <CheckRow
              key={n.id}
              checked={checked}
              onToggle={() => toggleNet(n.id)}
              title={n.name}
              subtitle={other ? (checked ? t('admin.movedFrom', { name: other }) : t('admin.currentlyIn', { name: other })) : (n.subnet ?? undefined)}
              detail={n.vlan ? `VLAN ${n.vlan}` : 'untagged'}
            />
          );
        })}
      </Group>

      <Group footer={t('groupEditor.anonymizeHint')}>
        <SwitchRow title={t('admin.showOnDashboard')} checked={!draft.hidden} onChange={(v) => set('hidden', !v)} />
        <SwitchRow title={t('groupEditor.anonymize')} checked={draft.anonymizeClients} onChange={(v) => set('anonymizeClients', v)} />
      </Group>

      {!isNew && onDelete && (
        <DeleteRow
          label={t('groupEditor.delete')}
          confirming={confirmDelete}
          onAsk={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete()}
          hint={t('groupEditor.deleteHint')}
        />
      )}
    </Sheet>
  );
}
