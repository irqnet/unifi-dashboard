/**
 * Kachel-Layout des Dashboards (Reihenfolge, Größe, ausgeblendete Kacheln).
 * Wird im Client und im Server (Validierung der API) verwendet – keine Server-Imports.
 */

/** Breiten in 12teln: ⅙, ¼, ⅓, ½, ⅔, voll */
export const TILE_WIDTHS = [2, 3, 4, 6, 8, 12] as const;
export type TileWidth = (typeof TILE_WIDTHS)[number];
/** Höhe in Rasterreihen (Mindesthöhe – Reihen wachsen mit dem Inhalt) */
export const TILE_MAX_ROWS = 6;

export const WIDTH_LABEL: Record<TileWidth, string> = { 2: '⅙', 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 12: 'Voll' };

export interface TileSize {
  w: TileWidth;
  h: number;
}

export interface TileLayout {
  /** Reihenfolge der Kachel-IDs */
  order: string[];
  /** Abweichende Größen je Kachel */
  size: Record<string, TileSize>;
  /** Ausgeblendete Kacheln */
  hidden: string[];
}

/** Bereiche mit eigenem Layout: Netzwerke, Hardware, je Statusseite */
export const SCOPE_RE = /^(network|hardware|status:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/;

const ID_RE = /^[\w:.-]{1,120}$/;
const MAX_TILES = 500;

export function isTileWidth(n: unknown): n is TileWidth {
  return typeof n === 'number' && (TILE_WIDTHS as readonly number[]).includes(n);
}

export function nearestWidth(n: number): TileWidth {
  return TILE_WIDTHS.reduce((best, w) => (Math.abs(w - n) < Math.abs(best - n) ? w : best), TILE_WIDTHS[0]);
}

/** Prüft ein Layout aus einer Anfrage; liefert eine bereinigte Kopie oder null. */
export function parseLayout(input: unknown): TileLayout | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.order) || !Array.isArray(o.hidden) || !o.size || typeof o.size !== 'object') return null;
  const ids = (a: unknown[]) => [...new Set(a.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))].slice(0, MAX_TILES);
  const size: Record<string, TileSize> = {};
  for (const [id, val] of Object.entries(o.size as Record<string, unknown>).slice(0, MAX_TILES)) {
    if (!ID_RE.test(id) || !val || typeof val !== 'object') continue;
    const { w, h } = val as { w?: unknown; h?: unknown };
    if (!isTileWidth(w) || typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > TILE_MAX_ROWS) continue;
    size[id] = { w, h };
  }
  return { order: ids(o.order), size, hidden: ids(o.hidden) };
}

export const EMPTY_LAYOUT: TileLayout = { order: [], size: {}, hidden: [] };

/**
 * Wendet ein gespeichertes Layout auf die aktuell vorhandenen Kacheln an.
 * Neue Kacheln (z. B. neu angelegte Gruppen) erscheinen an ihrer Standardposition,
 * nicht mehr vorhandene werden ignoriert.
 */
export function resolveOrder(defaultIds: string[], saved: TileLayout): string[] {
  const present = new Set(defaultIds);
  const order = saved.order.filter((id) => present.has(id));
  const placed = new Set(order);
  defaultIds.forEach((id, i) => {
    if (placed.has(id)) return;
    // hinter dem nächsten bereits platzierten Vorgänger aus der Standardreihenfolge einfügen
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = order.indexOf(defaultIds[j]);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    order.splice(at, 0, id);
    placed.add(id);
  });
  return order;
}
