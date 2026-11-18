/**
 * SQLite-Persistenz (better-sqlite3) für Admin-Konfiguration und Netzwerk-Gruppen.
 * Datei: ${DATA_DIR}/dashboard.db (Container: /app/data/dashboard.db).
 */
import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './env';

export type DisplayMode = 'consolidated' | 'expanded';

export interface NetworkGroup {
  id: number;
  site: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  displayMode: DisplayMode;
  anonymizeClients: boolean;
  hidden: boolean;
  networkIds: string[];
}

export interface NetworkSetting {
  site: string;
  networkId: string;
  hidden: boolean;
  anonymizeClients: boolean;
}

export interface GroupInput {
  name: string;
  description?: string;
  color?: string;
  displayMode?: DisplayMode;
  anonymizeClients?: boolean;
  hidden?: boolean;
  networkIds?: string[];
}

const g = globalThis as unknown as { __udDb?: Database.Database; __udDbStatus?: DbStatus };

export interface DbStatus {
  persistent: boolean;
  path: string;
  error: string | null;
}

function openFileDb(file: string): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.accessSync(path.dirname(file), fs.constants.W_OK);
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  return db;
}

/**
 * Öffnet die SQLite-DB. Ist das Datenverzeichnis nicht beschreibbar, wird mit einer
 * In-Memory-DB weitergearbeitet (Dashboard bleibt nutzbar, Admin-Einstellungen gehen
 * beim Neustart verloren) und eine klare Fehlermeldung geloggt.
 */
export function getDb(): Database.Database {
  if (g.__udDb) return g.__udDb;
  const file = path.join(path.resolve(getConfig().dataDir), 'dashboard.db');
  let db: Database.Database;
  try {
    db = openFileDb(file);
    g.__udDbStatus = { persistent: true, path: file, error: null };
  } catch (err) {
    const uid = typeof process.getuid === 'function' ? process.getuid() : '?';
    const gid = typeof process.getgid === 'function' ? process.getgid() : '?';
    const msg = (err as Error).message;
    console.error(
      `[db] Datenbank ${file} kann nicht geöffnet werden (${msg}). ` +
        `Prozess läuft als UID ${uid}/GID ${gid} – das Datenverzeichnis muss für diese UID beschreibbar sein ` +
        `(Host: "chown -R ${uid}:${gid} <pfad-zu>/data" oder DATA_PATH auf ein benanntes Volume setzen). ` +
        `Fallback: In-Memory-Datenbank, Admin-Einstellungen werden NICHT gespeichert.`,
    );
    db = new Database(':memory:');
    g.__udDbStatus = { persistent: false, path: file, error: `${msg} (UID ${uid})` };
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  g.__udDb = db;
  return db;
}

export function getDbStatus(): DbStatus {
  getDb();
  return g.__udDbStatus!;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS network_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#38bdf8',
      sort_order INTEGER NOT NULL DEFAULT 0,
      display_mode TEXT NOT NULL DEFAULT 'consolidated' CHECK (display_mode IN ('consolidated','expanded')),
      anonymize_clients INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_groups_site ON network_groups(site, sort_order);
    CREATE TABLE IF NOT EXISTS group_networks (
      group_id INTEGER NOT NULL REFERENCES network_groups(id) ON DELETE CASCADE,
      site TEXT NOT NULL,
      network_id TEXT NOT NULL,
      PRIMARY KEY (group_id, network_id),
      UNIQUE (site, network_id)
    );
    CREATE TABLE IF NOT EXISTS network_settings (
      site TEXT NOT NULL,
      network_id TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      anonymize_clients INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (site, network_id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (1)').run();
}

// --- Gruppen ------------------------------------------------------------------
interface GroupRow {
  id: number;
  site: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  display_mode: DisplayMode;
  anonymize_clients: number;
  hidden: number;
}

export function listGroups(site: string): NetworkGroup[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM network_groups WHERE site = ? ORDER BY sort_order ASC, id ASC')
    .all(site) as GroupRow[];
  const members = db
    .prepare('SELECT group_id, network_id FROM group_networks WHERE site = ?')
    .all(site) as { group_id: number; network_id: string }[];
  const byGroup = new Map<number, string[]>();
  for (const m of members) {
    const list = byGroup.get(m.group_id) ?? [];
    list.push(m.network_id);
    byGroup.set(m.group_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    site: r.site,
    name: r.name,
    description: r.description,
    color: r.color,
    sortOrder: r.sort_order,
    displayMode: r.display_mode,
    anonymizeClients: !!r.anonymize_clients,
    hidden: !!r.hidden,
    networkIds: byGroup.get(r.id) ?? [],
  }));
}

function setMembers(db: Database.Database, groupId: number, site: string, networkIds: string[]) {
  db.prepare('DELETE FROM group_networks WHERE group_id = ?').run(groupId);
  // Ein Netzwerk kann nur in genau einer Gruppe sein → aus anderen Gruppen entfernen
  const del = db.prepare('DELETE FROM group_networks WHERE site = ? AND network_id = ?');
  const ins = db.prepare('INSERT INTO group_networks (group_id, site, network_id) VALUES (?, ?, ?)');
  for (const id of Array.from(new Set(networkIds))) {
    del.run(site, id);
    ins.run(groupId, site, id);
  }
}

export function createGroup(site: string, input: GroupInput): NetworkGroup {
  const db = getDb();
  const tx = db.transaction(() => {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM network_groups WHERE site = ?').get(site) as {
      m: number;
    };
    const res = db
      .prepare(
        `INSERT INTO network_groups (site, name, description, color, sort_order, display_mode, anonymize_clients, hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        site,
        input.name,
        input.description ?? '',
        input.color ?? '#38bdf8',
        max.m + 1,
        input.displayMode ?? 'consolidated',
        input.anonymizeClients ? 1 : 0,
        input.hidden ? 1 : 0,
      );
    const id = Number(res.lastInsertRowid);
    setMembers(db, id, site, input.networkIds ?? []);
    return id;
  });
  const id = tx();
  return listGroups(site).find((x) => x.id === id)!;
}

export function updateGroup(id: number, input: GroupInput): NetworkGroup | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM network_groups WHERE id = ?').get(id) as GroupRow | undefined;
  if (!existing) return null;
  db.transaction(() => {
    db.prepare(
      `UPDATE network_groups SET name = ?, description = ?, color = ?, display_mode = ?,
         anonymize_clients = ?, hidden = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(
      input.name ?? existing.name,
      input.description ?? existing.description,
      input.color ?? existing.color,
      input.displayMode ?? existing.display_mode,
      input.anonymizeClients === undefined ? existing.anonymize_clients : input.anonymizeClients ? 1 : 0,
      input.hidden === undefined ? existing.hidden : input.hidden ? 1 : 0,
      id,
    );
    if (input.networkIds) setMembers(db, id, existing.site, input.networkIds);
  })();
  return listGroups(existing.site).find((x) => x.id === id) ?? null;
}

export function deleteGroup(id: number): boolean {
  return getDb().prepare('DELETE FROM network_groups WHERE id = ?').run(id).changes > 0;
}

export function reorderGroups(site: string, ids: number[]) {
  const db = getDb();
  const stmt = db.prepare('UPDATE network_groups SET sort_order = ? WHERE id = ? AND site = ?');
  db.transaction(() => ids.forEach((id, idx) => stmt.run(idx, id, site)))();
}

// --- Netzwerk-Einstellungen ---------------------------------------------------
export function listNetworkSettings(site: string): Map<string, NetworkSetting> {
  const rows = getDb()
    .prepare('SELECT * FROM network_settings WHERE site = ?')
    .all(site) as { site: string; network_id: string; hidden: number; anonymize_clients: number }[];
  return new Map(
    rows.map((r) => [
      r.network_id,
      { site: r.site, networkId: r.network_id, hidden: !!r.hidden, anonymizeClients: !!r.anonymize_clients },
    ]),
  );
}

export function upsertNetworkSetting(s: NetworkSetting) {
  getDb()
    .prepare(
      `INSERT INTO network_settings (site, network_id, hidden, anonymize_clients) VALUES (?, ?, ?, ?)
       ON CONFLICT(site, network_id) DO UPDATE SET hidden = excluded.hidden, anonymize_clients = excluded.anonymize_clients`,
    )
    .run(s.site, s.networkId, s.hidden ? 1 : 0, s.anonymizeClients ? 1 : 0);
}

// --- Globale Einstellungen ----------------------------------------------------
export interface AppSettings {
  showUngrouped: boolean;
}

const DEFAULT_SETTINGS: AppSettings = { showUngrouped: true };

export function getSettings(): AppSettings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key === 'showUngrouped') out.showUngrouped = r.value === 'true';
  }
  return out;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  if (patch.showUngrouped !== undefined) stmt.run('showUngrouped', String(patch.showUngrouped));
  return getSettings();
}
