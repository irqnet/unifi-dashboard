/**
 * Dashboard tile layout (order, size, hidden tiles).
 * Used on the client and the server (API validation) – no server imports.
 */

/** Widths in twelfths: ⅙, ¼, ⅓, ½, ⅔, full */
export const TILE_WIDTHS = [2, 3, 4, 6, 8, 12] as const;
export type TileWidth = (typeof TILE_WIDTHS)[number];
/** Height in grid rows (minimum height – rows grow with the content) */
export const TILE_MAX_ROWS = 6;

/** Fraction labels; 12 (full width) is translated in the UI. */
export const WIDTH_LABEL: Record<TileWidth, string> = { 2: '⅙', 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 12: '1/1' };

export interface TileSize {
  w: TileWidth;
  h: number;
}

export interface TileLayout {
  /** Order of tile IDs */
  order: string[];
  /** Custom sizes per tile */
  size: Record<string, TileSize>;
  /** Hidden tiles */
  hidden: string[];
}

/** Scopes with their own layout: networks, hardware, one per status page */
export const SCOPE_RE = /^(network|hardware|status:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/;

const ID_RE = /^[\w:.-]{1,120}$/;
const MAX_TILES = 500;

export function isTileWidth(n: unknown): n is TileWidth {
  return typeof n === 'number' && (TILE_WIDTHS as readonly number[]).includes(n);
}

export function nearestWidth(n: number): TileWidth {
  return TILE_WIDTHS.reduce((best, w) => (Math.abs(w - n) < Math.abs(best - n) ? w : best), TILE_WIDTHS[0]);
}

/** Checks a layout from a request; returns a cleaned copy or null. */
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
 * Applies a saved layout to the tiles currently present.
 * New tiles (e.g. newly created groups) appear at their default position,
 * tiles that no longer exist are ignored.
 */
export function resolveOrder(defaultIds: string[], saved: TileLayout): string[] {
  const present = new Set(defaultIds);
  const order = saved.order.filter((id) => present.has(id));
  const placed = new Set(order);
  defaultIds.forEach((id, i) => {
    if (placed.has(id)) return;
    // insert after the nearest already placed predecessor from the default order
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
