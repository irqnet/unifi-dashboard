'use client';

import clsx from 'clsx';
import { Check, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import type { AdminNetwork } from '@/lib/views';
import { Button, Toggle } from '../ui/primitives';

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

const PRESET_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb7185', '#2dd4bf', '#94a3b8'];

export function GroupEditor({
  initial,
  networks,
  groups,
  onSave,
  onCancel,
}: {
  initial: GroupDraft & { id?: number };
  networks: AdminNetwork[];
  groups: AdminGroup[];
  onSave: (draft: GroupDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<GroupDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof GroupDraft>(k: K, v: GroupDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name;

  const toggleNet = (id: string) =>
    set('networkIds', draft.networkIds.includes(id) ? draft.networkIds.filter((x) => x !== id) : [...draft.networkIds, id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError('Bitte einen Namen angeben');
      return;
    }
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
          <input className="w-full" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="z. B. Smart Home & IoT" autoFocus />
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
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-noc-muted">Anzeige auf der Statusseite</div>
          <div className="flex overflow-hidden rounded-lg border border-noc-line text-sm">
            {(
              [
                ['consolidated', 'Konsolidiert (eine Karte)'],
                ['expanded', 'Einzelkarten je VLAN'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => set('displayMode', v)}
                className={clsx('px-3 py-1.5', draft.displayMode === v ? 'bg-sky-500/20 text-sky-300' : 'text-noc-muted hover:bg-noc-raised')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Toggle checked={draft.anonymizeClients} onChange={(v) => set('anonymizeClients', v)} label="Client-Hostnamen anonymisieren" />
          <Toggle checked={draft.hidden} onChange={(v) => set('hidden', v)} label="Gruppe auf Statusseite verbergen" />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-noc-muted">Zugeordnete Netzwerke / VLANs ({draft.networkIds.length})</span>
        </div>
        <div className="grid max-h-72 gap-1.5 overflow-y-auto rounded-lg border border-noc-line bg-noc-bg p-2 sm:grid-cols-2 lg:grid-cols-3">
          {networks.length === 0 && <p className="p-2 text-sm text-noc-muted">Keine Netzwerke vom Controller geladen.</p>}
          {networks.map((n) => {
            const checked = draft.networkIds.includes(n.id);
            const other = n.groupId !== null && n.groupId !== initial.id ? groupName(n.groupId) : undefined;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => toggleNet(n.id)}
                className={clsx(
                  'flex items-start gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition',
                  checked ? 'border-sky-500/60 bg-sky-500/10' : 'border-noc-line hover:border-slate-500',
                )}
              >
                <span
                  className={clsx(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    checked ? 'border-sky-400 bg-sky-500 text-slate-950' : 'border-noc-line',
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-noc-text">{n.name}</span>
                  <span className="block font-mono text-[11px] text-noc-muted">
                    {n.vlan ? `VLAN ${n.vlan}` : 'untagged'} · {n.subnet ?? '–'}
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
