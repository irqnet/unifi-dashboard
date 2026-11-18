'use client';

import { useState } from 'react';
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
  const [draft, setDraft] = useState<GroupDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof GroupDraft>(k: K, v: GroupDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name;

  const toggleNet = (id: string) =>
    set('networkIds', draft.networkIds.includes(id) ? draft.networkIds.filter((x) => x !== id) : [...draft.networkIds, id]);

  async function submit() {
    if (!draft.name.trim()) return setError('Gib der Gruppe einen Namen.');
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={isNew ? 'Neue Gruppe' : 'Gruppe bearbeiten'} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <Group>
        <FieldRow label="Name" htmlFor="grp-name">
          <TextInput id="grp-name" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="z. B. Smart Home & IoT" />
        </FieldRow>
        <FieldRow label="Beschreibung" htmlFor="grp-desc">
          <TextInput id="grp-desc" value={draft.description} maxLength={300} onChange={(e) => set('description', e.target.value)} placeholder="Optional" />
        </FieldRow>
        <FieldRow label="Farbe">
          <ColorPicker value={draft.color} onChange={(c) => set('color', c)} />
        </FieldRow>
        <FieldRow label="Darstellung">
          <Segmented
            value={draft.displayMode}
            options={[
              ['consolidated', 'Zusammengefasst'],
              ['expanded', 'Einzeln je VLAN'],
            ]}
            onChange={(v) => set('displayMode', v)}
          />
        </FieldRow>
      </Group>

      <Group title="Netzwerke" aside={`${draft.networkIds.length} ausgewählt`}>
        {networks.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">Vom Controller wurden keine Netzwerke geladen.</p>}
        {networks.map((n) => {
          const checked = draft.networkIds.includes(n.id);
          const other = n.groupId !== null && n.groupId !== initial.id ? groupName(n.groupId) : undefined;
          return (
            <CheckRow
              key={n.id}
              checked={checked}
              onToggle={() => toggleNet(n.id)}
              title={n.name}
              subtitle={other ? (checked ? `Wird aus „${other}“ verschoben` : `Derzeit in „${other}“`) : (n.subnet ?? undefined)}
              detail={n.vlan ? `VLAN ${n.vlan}` : 'untagged'}
            />
          );
        })}
      </Group>

      <Group footer="Anonymisiert erscheinen Clients ohne Hostname, IP und MAC als „Client 1, Client 2 …“.">
        <SwitchRow title="Auf dem Dashboard anzeigen" checked={!draft.hidden} onChange={(v) => set('hidden', !v)} />
        <SwitchRow title="Hostnamen anonymisieren" checked={draft.anonymizeClients} onChange={(v) => set('anonymizeClients', v)} />
      </Group>

      {!isNew && onDelete && (
        <DeleteRow
          label="Gruppe löschen"
          confirming={confirmDelete}
          onAsk={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete()}
          hint="Die Netzwerke bleiben erhalten und erscheinen danach ohne Gruppe."
        />
      )}
    </Sheet>
  );
}
