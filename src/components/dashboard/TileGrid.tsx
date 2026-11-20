'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { EyeOff, GripVertical, Scaling } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { TILE_MAX_ROWS, TILE_WIDTHS, WIDTH_LABEL, nearestWidth, type TileLayout, type TileSize, type TileWidth } from '@/lib/layout';

export interface TileDef {
  id: string;
  /** Name für die Liste ausgeblendeter Kacheln und Screenreader */
  title: string;
  w: TileWidth;
  h: number;
  /** Kennzahl: auf dem Handy in der wischbaren Leiste statt im Raster */
  kpi?: boolean;
  /** Bereich, in dem die Kachel steht (eigenes Raster, nur innerhalb verschiebbar) */
  section?: string;
  /** Auf Handy und Tablet immer volle Breite (z. B. WAN-Kacheln nebeneinander nur am Desktop) */
  fullBelowLg?: boolean;
  render: () => ReactNode;
}

/** Ziel ist die Kachel unter dem Zeiger; daneben (Lücke) die nächstgelegene. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

const spanSm = (w: TileWidth) => Math.ceil(w / 2);
const spanXs = (w: TileWidth) => (w >= 8 ? 2 : 1);

function cellStyle(size: TileSize, fullBelowLg?: boolean): CSSProperties {
  return {
    ['--span-lg' as string]: size.w,
    ['--span-sm' as string]: fullBelowLg ? 6 : spanSm(size.w),
    ['--span-xs' as string]: fullBelowLg ? 2 : spanXs(size.w),
    ['--rows' as string]: size.h,
  };
}

/**
 * Raster aus verschiebbaren und skalierbaren Kacheln.
 * Im Bearbeitungsmodus: ziehen zum Verschieben (Touch: lange drücken),
 * Ecke ziehen oder Größenmenü zum Skalieren, Auge zum Ausblenden.
 */
export interface TileSection {
  id: string;
  /** Überschrift; ohne Titel steht der Bereich ohne Kopfzeile */
  title?: string;
}

export function TileGrid({
  tiles,
  sections,
  order,
  layout,
  editing,
  onChange,
}: {
  tiles: TileDef[];
  /** Bereiche in Anzeigereihenfolge; Kacheln ohne passenden Bereich landen im letzten */
  sections?: TileSection[];
  /** Aufgelöste Reihenfolge aller Kachel-IDs */
  order: string[];
  layout: TileLayout;
  editing: boolean;
  onChange: (next: TileLayout) => void;
}) {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const hidden = new Set(layout.hidden);
  const visible = order.filter((id) => byId.has(id) && !hidden.has(id));
  const sizeOf = (t: TileDef): TileSize => layout.size[t.id] ?? { w: t.w, h: t.h };
  const rootRef = useRef<HTMLDivElement>(null);
  const secs = sections?.length ? sections : [{ id: '' }];
  const sectionOf = (id: string) => {
    const sec = byId.get(id)?.section;
    return secs.some((x) => x.id === sec) ? sec! : secs[secs.length - 1].id;
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRect, setActiveRect] = useState<{ width: number; height: number } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setOrder = (next: string[]) => onChange({ ...layout, order: next });
  const setSize = (id: string, size: TileSize) => onChange({ ...layout, order, size: { ...layout.size, [id]: size } });
  const hide = (id: string) => onChange({ ...layout, order, hidden: [...layout.hidden.filter((x) => x !== id), id] });

  const lastOver = useRef<string | null>(null);
  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    lastOver.current = null;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(id)}"]`);
    const r = el?.getBoundingClientRect();
    setActiveRect(r ? { width: r.width, height: r.height } : null);
  };
  // Live umsortieren, während gezogen wird – funktioniert auch bei unterschiedlich großen Kacheln.
  // Pro Ziel nur einmal tauschen, sonst springen ungleich große Kacheln hin und her.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || lastOver.current === String(over.id)) return;
    // Nur innerhalb des eigenen Bereichs verschieben
    if (sectionOf(String(active.id)) !== sectionOf(String(over.id))) return;
    lastOver.current = String(over.id);
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from >= 0 && to >= 0) setOrder(arrayMove(order, from, to));
  };
  const onDragEnd = (_e: DragEndEvent) => {
    setActiveId(null);
    setActiveRect(null);
  };

  const kpis = visible.filter((id) => byId.get(id)!.kpi);
  const active = activeId ? byId.get(activeId) : null;

  return (
    <div ref={rootRef} className="space-y-4 sm:space-y-5">
      {/* Handy: Kennzahlen als wischbare Leiste */}
      {!editing && kpis.length > 0 && (
        <div className="no-scrollbar -mx-3 mb-2.5 flex snap-x scroll-px-3 gap-2 overflow-x-auto px-3 pb-1 sm:hidden">
          {kpis.map((id) => (
            <div key={id} className="@container w-[152px] shrink-0 snap-start">
              {byId.get(id)!.render()}
            </div>
          ))}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragEnd}>
        {secs.map((sec) => {
          const ids = visible.filter((id) => sectionOf(id) === sec.id);
          if (!ids.length) return null;
          // Bereich nur aus Kennzahlen: auf dem Handy steht er in der wischbaren Leiste
          const onlyKpi = !editing && ids.every((id) => byId.get(id)!.kpi);
          return (
            <section key={sec.id} className={clsx(onlyKpi && 'max-sm:hidden')}>
              {sec.title && <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-noc-muted sm:mb-2.5">{sec.title}</h2>}
              <SortableContext items={ids} strategy={() => null}>
                <SectionGrid>
                  {(gridRef) =>
                    ids.map((id) => {
                      const t = byId.get(id)!;
                      return (
                        <SortableTile
                          key={id}
                          tile={t}
                          size={sizeOf(t)}
                          editing={editing}
                          gridRef={gridRef}
                          onSize={(s) => setSize(id, s)}
                          onHide={() => hide(id)}
                        />
                      );
                    })
                  }
                </SectionGrid>
              </SortableContext>
            </section>
          );
        })}
        <DragOverlay dropAnimation={null}>
          {active && activeRect ? (
            <div
              className="pointer-events-none @container rotate-[0.8deg] scale-[1.02] rounded-xl opacity-95 shadow-2xl ring-2 ring-sky-400"
              style={{ width: activeRect.width, height: activeRect.height }}
            >
              <div className="h-full [&>*]:h-full">{active.render()}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SectionGrid({ children }: { children: (ref: React.RefObject<HTMLDivElement | null>) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="tile-grid">
      {children(ref)}
    </div>
  );
}

function SortableTile({
  tile,
  size,
  editing,
  gridRef,
  onSize,
  onHide,
}: {
  tile: TileDef;
  size: TileSize;
  editing: boolean;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onSize: (s: TileSize) => void;
  onHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: tile.id, disabled: !editing });
  const [menu, setMenu] = useState(false);
  const cellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setMenu(false);
  }, [editing]);

  // Ecke ziehen: Breite in Rasterspalten, Höhe in Reihen einrasten
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    const cell = cellRef.current;
    if (!grid || !cell) return;
    const cs = getComputedStyle(grid);
    const cols = cs.gridTemplateColumns.split(' ').length;
    const gap = parseFloat(cs.columnGap) || 12;
    const rowMin = parseFloat(cs.getPropertyValue('--tile-row')) || 108;
    const colW = (grid.clientWidth - gap * (cols - 1)) / cols;
    const start = cell.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let last = size;
    const move = (ev: PointerEvent) => {
      const span = Math.max(1, Math.min(cols, Math.round((start.width + ev.clientX - sx + gap) / (colW + gap))));
      const w = nearestWidth((span * 12) / cols);
      const h = Math.max(1, Math.min(TILE_MAX_ROWS, Math.round((start.height + ev.clientY - sy + gap) / (rowMin + gap))));
      if (w !== last.w || h !== last.h) {
        last = { w, h };
        onSize(last);
      }
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        cellRef.current = el;
      }}
      style={{ ...cellStyle(size, tile.fullBelowLg), transform: DndCSS.Translate.toString(transform) }}
      className={clsx(
        'tile-cell group/tile relative @container',
        tile.kpi && !editing && 'max-sm:hidden',
        editing && 'cursor-grab touch-manipulation select-none active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
      data-tile-id={tile.id}
      aria-label={editing ? `${tile.title} – verschieben` : undefined}
      {...(editing ? attributes : {})}
      {...(editing ? listeners : {})}
    >
      <div className={clsx('h-full [&>*]:h-full', editing && 'pointer-events-none')}>{tile.render()}</div>

      {editing && (
        <>
          <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-sky-400/50 ring-offset-0 [border-style:dashed]" />
          <div className="absolute right-2 top-2 z-10 flex gap-1" onMouseDown={stop} onTouchStart={stop} onPointerDown={stop} onKeyDown={stop}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-noc-panel/95 text-noc-muted shadow ring-1 ring-noc-line" aria-hidden>
              <GripVertical className="h-3.5 w-3.5" />
            </span>
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              className={clsx('flex h-7 w-7 items-center justify-center rounded-lg shadow ring-1 ring-noc-line', menu ? 'bg-sky-500 text-white' : 'bg-noc-panel/95 text-noc-muted hover:text-noc-text')}
              aria-label={`Größe von ${tile.title}`}
              title="Größe"
            >
              <Scaling className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onHide}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-noc-panel/95 text-noc-muted shadow ring-1 ring-noc-line hover:text-rose-300"
              aria-label={`${tile.title} ausblenden`}
              title="Ausblenden"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          </div>
          {menu && (
            <div className="absolute right-2 top-11 z-20 w-56 rounded-xl bg-noc-panel p-2.5 text-xs shadow-2xl ring-1 ring-noc-line" onMouseDown={stop} onTouchStart={stop} onPointerDown={stop} onKeyDown={stop}>
              <div className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wider text-noc-muted">Breite</div>
              <div className="grid grid-cols-6 gap-1">
                {TILE_WIDTHS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => onSize({ ...size, w })}
                    className={clsx('rounded-md py-1.5 font-medium', size.w === w ? 'bg-sky-500 text-white' : 'bg-noc-raised text-noc-text hover:bg-fg/10')}
                  >
                    {WIDTH_LABEL[w]}
                  </button>
                ))}
              </div>
              <div className="mb-1.5 mt-2.5 px-0.5 text-[10px] font-medium uppercase tracking-wider text-noc-muted">Höhe (Reihen)</div>
              <div className="grid grid-cols-6 gap-1">
                {Array.from({ length: TILE_MAX_ROWS }, (_, i) => i + 1).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onSize({ ...size, h })}
                    className={clsx('rounded-md py-1.5 font-medium', size.h === h ? 'bg-sky-500 text-white' : 'bg-noc-raised text-noc-text hover:bg-fg/10')}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="mt-2 px-0.5 text-[11px] leading-snug text-noc-muted">Auf dem Handy werden Kacheln automatisch ein- oder zweispaltig angeordnet.</p>
            </div>
          )}
          <span
            onPointerDown={startResize}
            onMouseDown={stop}
            onTouchStart={stop}
            className="absolute bottom-1 right-1 z-10 hidden h-5 w-5 cursor-nwse-resize touch-none items-end justify-end sm:flex"
            role="presentation"
            title="Ziehen zum Skalieren"
          >
            <span className="h-3 w-3 rounded-br-md border-b-[3px] border-r-[3px] border-sky-400" />
          </span>
        </>
      )}
    </div>
  );
}
