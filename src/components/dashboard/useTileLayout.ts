'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMPTY_LAYOUT, parseLayout, type TileLayout } from '@/lib/layout';

const localKey = (scope: string) => `ud.layout.${scope}`;

function readLocal(scope: string): TileLayout | null {
  try {
    const raw = window.localStorage.getItem(localKey(scope));
    return raw ? parseLayout(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(scope: string, layout: TileLayout | null) {
  try {
    if (layout) window.localStorage.setItem(localKey(scope), JSON.stringify(layout));
    else window.localStorage.removeItem(localKey(scope));
  } catch {
    /* ignore */
  }
}

interface ServerState {
  own: TileLayout | null;
  default: TileLayout | null;
  canSaveOwn: boolean;
  canSaveDefault: boolean;
}

/**
 * Lädt und speichert das Kachel-Layout eines Bereichs.
 * Mit Benutzerkonto auf dem Server, sonst im Browser. Ohne eigenes Layout gilt
 * das Standardlayout des Admins, ohne dieses die eingebaute Anordnung.
 */
export function useTileLayout(scope: string) {
  const [server, setServer] = useState<ServerState | null>(null);
  const [local, setLocal] = useState<TileLayout | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLocal(readLocal(scope));
    setServer(null);
    fetch(`/api/layout?scope=${encodeURIComponent(scope)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<ServerState>) : null))
      .then((s) => {
        if (!cancelled) setServer(s ?? { own: null, default: null, canSaveOwn: false, canSaveDefault: false });
      })
      .catch(() => {
        if (!cancelled) setServer({ own: null, default: null, canSaveOwn: false, canSaveDefault: false });
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const canSaveOwn = !!server?.canSaveOwn;
  const own = canSaveOwn ? server?.own ?? null : local;
  const layout: TileLayout = own ?? server?.default ?? EMPTY_LAYOUT;

  const request = useCallback(
    async (method: 'PUT' | 'DELETE', target: 'own' | 'default', body?: TileLayout) => {
      const res = await fetch(method === 'DELETE' ? `/api/layout?scope=${encodeURIComponent(scope)}&target=${target}` : '/api/layout', {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify({ scope, layout: body, target }) : undefined,
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    },
    [scope],
  );

  const save = useCallback(
    async (next: TileLayout) => {
      setError(null);
      if (canSaveOwn) {
        setServer((s) => (s ? { ...s, own: next } : s));
        await request('PUT', 'own', next).catch((e: Error) => setError(e.message));
      } else {
        setLocal(next);
        writeLocal(scope, next);
      }
    },
    [canSaveOwn, request, scope],
  );

  /** Eigenes Layout verwerfen → Standardlayout gilt wieder. */
  const reset = useCallback(async () => {
    setError(null);
    if (canSaveOwn) {
      setServer((s) => (s ? { ...s, own: null } : s));
      await request('DELETE', 'own').catch((e: Error) => setError(e.message));
    } else {
      setLocal(null);
      writeLocal(scope, null);
    }
  }, [canSaveOwn, request, scope]);

  /** Admin: Layout als Standard für alle speichern (eigenes Layout entfällt dann). */
  const saveAsDefault = useCallback(
    async (next: TileLayout) => {
      setError(null);
      try {
        await request('PUT', 'default', next);
        if (canSaveOwn) await request('DELETE', 'own');
        else writeLocal(scope, null);
        setLocal(null);
        setServer((s) => (s ? { ...s, default: next, own: null } : s));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [canSaveOwn, request, scope],
  );

  /** Admin: Standardlayout entfernen → eingebaute Anordnung. */
  const clearDefault = useCallback(async () => {
    setError(null);
    try {
      await request('DELETE', 'default');
      setServer((s) => (s ? { ...s, default: null } : s));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [request]);

  return {
    layout,
    ready: server !== null,
    hasOwn: !!own,
    hasDefault: !!server?.default,
    defaultLayout: server?.default ?? EMPTY_LAYOUT,
    canSaveOwn,
    canSaveDefault: !!server?.canSaveDefault,
    error,
    save,
    reset,
    saveAsDefault,
    clearDefault,
  };
}
