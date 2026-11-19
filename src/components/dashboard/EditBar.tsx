'use client';

import clsx from 'clsx';
import { Eye, PencilRuler, RotateCcw, Users } from 'lucide-react';
import { useState } from 'react';
import type { TileLayout } from '@/lib/layout';
import type { TileDef } from './TileGrid';

const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors';

/** Leiste im Bearbeitungsmodus: Hinweise, ausgeblendete Kacheln, Zurücksetzen, Speichern. */
export function EditBar({
  tiles,
  draft,
  canSaveOwn,
  canSaveDefault,
  hasDefault,
  error,
  onChange,
  onCancel,
  onDone,
  onReset,
  onSaveDefault,
  onClearDefault,
}: {
  tiles: TileDef[];
  draft: TileLayout;
  canSaveOwn: boolean;
  canSaveDefault: boolean;
  hasDefault: boolean;
  error: string | null;
  onChange: (l: TileLayout) => void;
  onCancel: () => void;
  onDone: () => void;
  onReset: () => void;
  onSaveDefault: () => void;
  onClearDefault: () => void;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const titles = new Map(tiles.map((t) => [t.id, t.title]));
  const hidden = draft.hidden.filter((id) => titles.has(id));

  return (
    <div className="sticky top-[60px] z-30 rounded-2xl bg-sky-500/10 px-3 py-2.5 ring-1 ring-inset ring-sky-500/25 backdrop-blur-xl sm:px-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 text-[13px] text-noc-text">
          <PencilRuler className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <div className="min-w-0">
            <span className="font-semibold">Kacheln anordnen</span>
            <span className="hidden text-noc-muted md:inline">
              {' '}
              – ziehen zum Verschieben, Ecke ziehen oder Größen-Symbol zum Skalieren, Auge zum Ausblenden.
            </span>
            <span className="text-noc-muted md:hidden"> – zum Verschieben lange drücken und ziehen.</span>
            <div className="text-[11.5px] text-noc-muted">{canSaveOwn ? 'Wird für dein Benutzerkonto gespeichert.' : 'Wird in diesem Browser gespeichert.'}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              disabled={!hidden.length}
              className={clsx(btn, 'bg-noc-panel text-noc-text ring-1 ring-noc-line hover:bg-noc-raised disabled:opacity-50')}
            >
              <Eye className="h-3.5 w-3.5" /> Ausgeblendet ({hidden.length})
            </button>
            {showHidden && hidden.length > 0 && (
              <div className="absolute left-0 top-10 z-40 w-64 overflow-hidden rounded-xl bg-noc-panel shadow-2xl ring-1 ring-noc-line">
                {hidden.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      const next = draft.hidden.filter((x) => x !== id);
                      onChange({ ...draft, hidden: next });
                      if (!next.some((x) => titles.has(x))) setShowHidden(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 border-b border-noc-line px-3 py-2 text-left text-sm text-noc-text last:border-0 hover:bg-fg/5"
                  >
                    <span className="truncate">{titles.get(id)}</span>
                    <span className="shrink-0 text-xs text-sky-400">Einblenden</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onReset} className={clsx(btn, 'bg-noc-panel text-noc-text ring-1 ring-noc-line hover:bg-noc-raised')} title={hasDefault ? 'Standardlayout des Admins verwenden' : 'Eingebaute Anordnung verwenden'}>
            <RotateCcw className="h-3.5 w-3.5" /> Zurücksetzen
          </button>
          {canSaveDefault && (
            <>
              <button type="button" onClick={onSaveDefault} className={clsx(btn, 'bg-noc-panel text-noc-text ring-1 ring-noc-line hover:bg-noc-raised')} title="Diese Anordnung gilt für alle ohne eigenes Layout">
                <Users className="h-3.5 w-3.5" /> Als Standard für alle
              </button>
              {hasDefault && (
                <button type="button" onClick={onClearDefault} className={clsx(btn, 'text-noc-muted hover:text-rose-300')} title="Standardlayout entfernen (eingebaute Anordnung)">
                  Standard entfernen
                </button>
              )}
            </>
          )}
          <span className="mx-0.5 hidden h-5 w-px bg-noc-line sm:block" />
          <button type="button" onClick={onCancel} className={clsx(btn, 'text-noc-muted hover:text-noc-text')}>
            Abbrechen
          </button>
          <button type="button" onClick={onDone} className={clsx(btn, 'bg-sky-500 text-white hover:bg-sky-600')}>
            Fertig
          </button>
        </div>
      </div>
      {error && <div className="mt-1.5 text-xs text-rose-300">{error}</div>}
    </div>
  );
}
