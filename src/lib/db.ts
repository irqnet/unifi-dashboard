/**
 * SQLite persistence (better-sqlite3) for admin configuration and network groups.
 * File: ${DATA_DIR}/dashboard.db (container: /app/data/dashboard.db).
 */
import 'server-only';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './env';
import { DEFAULT_LOCALE, isLocale, type Locale } from './i18n/config';
import { parseLayout, type TileLayout } from './layout';

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
 * Opens the SQLite DB. If the data directory is not writable, an in-memory DB is used
 * instead (the dashboard stays usable, admin settings are lost on restart) and a clear
 * error message is logged.
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
      `[db] Cannot open database ${file} (${msg}). ` +
        `Process runs as UID ${uid}/GID ${gid} – the data directory must be writable for this UID ` +
        `(host: "chown -R ${uid}:${gid} <path-to>/data" or set DATA_PATH to a named volume). ` +
        `Fallback: in-memory database, admin settings will NOT be saved.`,
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
    CREATE TABLE IF NOT EXISTS device_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#38bdf8',
      sort_order INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_device_groups_site ON device_groups(site, sort_order);
    CREATE TABLE IF NOT EXISTS device_group_members (
      group_id INTEGER NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
      site TEXT NOT NULL,
      device_mac TEXT NOT NULL,
      PRIMARY KEY (group_id, device_mac),
      UNIQUE (site, device_mac)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      session_version INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS status_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      show_wan INTEGER NOT NULL DEFAULT 0,
      is_public INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS status_page_groups (
      page_id INTEGER NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES network_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (page_id, group_id)
    );
    CREATE TABLE IF NOT EXISTS status_page_device_groups (
      page_id INTEGER NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (page_id, group_id)
    );
    CREATE TABLE IF NOT EXISTS user_pages (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page_id INTEGER NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, page_id)
    );
    -- Tile layouts: user_id 0 = default layout (set by an admin), otherwise user account
    CREATE TABLE IF NOT EXISTS dashboard_layouts (
      user_id INTEGER NOT NULL,
      scope TEXT NOT NULL,
      layout TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, scope)
    );
    CREATE TABLE IF NOT EXISTS wan_settings (
      site TEXT NOT NULL,
      wan_key TEXT NOT NULL,
      provider TEXT,
      PRIMARY KEY (site, wan_key)
    );
    -- Traffic history: average bit/s per network (net_id '__wan' = WAN total) over span minutes
    -- (1-minute values for 24 h, then 15-minute values for 7 days)
    CREATE TABLE IF NOT EXISTS traffic_history (
      site TEXT NOT NULL,
      t INTEGER NOT NULL,
      span INTEGER NOT NULL,
      net_id TEXT NOT NULL,
      down REAL NOT NULL,
      up REAL NOT NULL,
      PRIMARY KEY (site, t, span, net_id)
    ) WITHOUT ROWID;
    -- Which WAN carried the internet traffic when ('' = no internet)
    CREATE TABLE IF NOT EXISTS wan_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site TEXT NOT NULL,
      wan_key TEXT NOT NULL,
      reason TEXT,
      started_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      ended_at INTEGER,
      rx_bytes REAL NOT NULL DEFAULT 0,
      tx_bytes REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_wan_periods_site ON wan_periods(site, started_at);
    -- Data volume per WAN and day (server-local date)
    CREATE TABLE IF NOT EXISTS wan_usage (
      site TEXT NOT NULL,
      wan_key TEXT NOT NULL,
      day TEXT NOT NULL,
      rx_bytes REAL NOT NULL DEFAULT 0,
      tx_bytes REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (site, wan_key, day)
    ) WITHOUT ROWID;
    -- Last byte counters of the gateway per WAN (to count the volume across restarts)
    CREATE TABLE IF NOT EXISTS wan_counters (
      site TEXT NOT NULL,
      wan_key TEXT NOT NULL,
      rx_bytes REAL NOT NULL,
      tx_bytes REAL NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (site, wan_key)
    ) WITHOUT ROWID;
  `);
  const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (1)').run();
  // v2: per-user language
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'language')) db.exec('ALTER TABLE users ADD COLUMN language TEXT');
  // v3: data allowance per WAN
  const wanCols = db.prepare('PRAGMA table_info(wan_settings)').all() as { name: string }[];
  if (!wanCols.some((c) => c.name === 'quota_gb')) db.exec('ALTER TABLE wan_settings ADD COLUMN quota_gb REAL');
  if (!wanCols.some((c) => c.name === 'cycle_day')) db.exec('ALTER TABLE wan_settings ADD COLUMN cycle_day INTEGER');
}

// --- Groups --------------------------------------------------------------------
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
  // A network can only be in exactly one group → remove it from other groups
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

// --- Network settings -------------------------------------------------------
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

// --- WAN settings ------------------------------------------------------------
/** Provider names entered by the admin per WAN connection (key: WAN, WAN2 …). */
export function listWanProviders(site: string): Map<string, string> {
  const rows = getDb().prepare('SELECT wan_key, provider FROM wan_settings WHERE site = ?').all(site) as { wan_key: string; provider: string | null }[];
  return new Map(rows.filter((r) => r.provider).map((r) => [r.wan_key, r.provider as string]));
}

export interface WanQuota {
  /** Monthly data allowance in GB, null = no limit */
  quotaGb: number | null;
  /** Day of the month on which the allowance resets (1–28) */
  cycleDay: number;
}

export function listWanQuotas(site: string): Map<string, WanQuota> {
  const rows = getDb().prepare('SELECT wan_key, quota_gb, cycle_day FROM wan_settings WHERE site = ?').all(site) as {
    wan_key: string;
    quota_gb: number | null;
    cycle_day: number | null;
  }[];
  return new Map(rows.map((r) => [r.wan_key, { quotaGb: r.quota_gb && r.quota_gb > 0 ? r.quota_gb : null, cycleDay: r.cycle_day ?? 1 }]));
}

export function setWanQuota(site: string, wanKey: string, q: WanQuota) {
  getDb()
    .prepare(
      `INSERT INTO wan_settings (site, wan_key, quota_gb, cycle_day) VALUES (?, ?, ?, ?)
       ON CONFLICT(site, wan_key) DO UPDATE SET quota_gb = excluded.quota_gb, cycle_day = excluded.cycle_day`,
    )
    .run(site, wanKey, q.quotaGb, q.cycleDay);
}

export function setWanProvider(site: string, wanKey: string, provider: string | null) {
  getDb()
    .prepare(
      `INSERT INTO wan_settings (site, wan_key, provider) VALUES (?, ?, ?)
       ON CONFLICT(site, wan_key) DO UPDATE SET provider = excluded.provider`,
    )
    .run(site, wanKey, provider);
}

// --- Global settings ---------------------------------------------------------
export interface AppSettings {
  showUngrouped: boolean;
  showUngroupedDevices: boolean;
  /** Shared access (gate without a user account) may see the full overview */
  allowSharedAccess: boolean;
  /** Language for visitors without a saved choice whose browser language is not supported */
  defaultLanguage: Locale;
}

const BOOL_SETTINGS = ['showUngrouped', 'showUngroupedDevices', 'allowSharedAccess'] as const;
const DEFAULT_SETTINGS: AppSettings = {
  showUngrouped: true,
  showUngroupedDevices: true,
  allowSharedAccess: true,
  defaultLanguage: DEFAULT_LOCALE,
};

export function getSettings(): AppSettings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if ((BOOL_SETTINGS as readonly string[]).includes(r.key)) out[r.key as (typeof BOOL_SETTINGS)[number]] = r.value === 'true';
    else if (r.key === 'defaultLanguage' && isLocale(r.value)) out.defaultLanguage = r.value;
  }
  return out;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const key of BOOL_SETTINGS) if (patch[key] !== undefined) stmt.run(key, String(patch[key]));
  if (patch.defaultLanguage && isLocale(patch.defaultLanguage)) stmt.run('defaultLanguage', patch.defaultLanguage);
  return getSettings();
}

// --- Device groups (switches & access points) -------------------------------
export interface DeviceGroup {
  id: number;
  site: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
  hidden: boolean;
  deviceMacs: string[];
}

export interface DeviceGroupInput {
  name: string;
  description?: string;
  color?: string;
  hidden?: boolean;
  deviceMacs?: string[];
}

interface DeviceGroupRow {
  id: number;
  site: string;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  hidden: number;
}

export function listDeviceGroups(site: string): DeviceGroup[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM device_groups WHERE site = ? ORDER BY sort_order ASC, id ASC')
    .all(site) as DeviceGroupRow[];
  const members = db
    .prepare('SELECT group_id, device_mac FROM device_group_members WHERE site = ?')
    .all(site) as { group_id: number; device_mac: string }[];
  const byGroup = new Map<number, string[]>();
  for (const m of members) byGroup.set(m.group_id, [...(byGroup.get(m.group_id) ?? []), m.device_mac]);
  return rows.map((r) => ({
    id: r.id,
    site: r.site,
    name: r.name,
    description: r.description,
    color: r.color,
    sortOrder: r.sort_order,
    hidden: !!r.hidden,
    deviceMacs: byGroup.get(r.id) ?? [],
  }));
}

function setDeviceMembers(db: Database.Database, groupId: number, site: string, macs: string[]) {
  db.prepare('DELETE FROM device_group_members WHERE group_id = ?').run(groupId);
  const del = db.prepare('DELETE FROM device_group_members WHERE site = ? AND device_mac = ?');
  const ins = db.prepare('INSERT INTO device_group_members (group_id, site, device_mac) VALUES (?, ?, ?)');
  for (const mac of Array.from(new Set(macs.map((m) => m.toLowerCase())))) {
    del.run(site, mac);
    ins.run(groupId, site, mac);
  }
}

export function createDeviceGroup(site: string, input: DeviceGroupInput): DeviceGroup {
  const db = getDb();
  const id = db.transaction(() => {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM device_groups WHERE site = ?').get(site) as { m: number };
    const res = db
      .prepare('INSERT INTO device_groups (site, name, description, color, sort_order, hidden) VALUES (?, ?, ?, ?, ?, ?)')
      .run(site, input.name, input.description ?? '', input.color ?? '#38bdf8', max.m + 1, input.hidden ? 1 : 0);
    const newId = Number(res.lastInsertRowid);
    setDeviceMembers(db, newId, site, input.deviceMacs ?? []);
    return newId;
  })();
  return listDeviceGroups(site).find((g) => g.id === id)!;
}

export function updateDeviceGroup(id: number, input: Partial<DeviceGroupInput>): DeviceGroup | null {
  const db = getDb();
  const ex = db.prepare('SELECT * FROM device_groups WHERE id = ?').get(id) as DeviceGroupRow | undefined;
  if (!ex) return null;
  db.transaction(() => {
    db.prepare(
      "UPDATE device_groups SET name = ?, description = ?, color = ?, hidden = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(
      input.name ?? ex.name,
      input.description ?? ex.description,
      input.color ?? ex.color,
      input.hidden === undefined ? ex.hidden : input.hidden ? 1 : 0,
      id,
    );
    if (input.deviceMacs) setDeviceMembers(db, id, ex.site, input.deviceMacs);
  })();
  return listDeviceGroups(ex.site).find((g) => g.id === id) ?? null;
}

export function deleteDeviceGroup(id: number): boolean {
  return getDb().prepare('DELETE FROM device_groups WHERE id = ?').run(id).changes > 0;
}

export function reorderDeviceGroups(site: string, ids: number[]) {
  const db = getDb();
  const stmt = db.prepare('UPDATE device_groups SET sort_order = ? WHERE id = ? AND site = ?');
  db.transaction(() => ids.forEach((id, idx) => stmt.run(idx, id, site)))();
}

// --- Users ----------------------------------------------------------------------
export interface User {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  disabled: boolean;
  sessionVersion: number;
  lastLoginAt: string | null;
  createdAt: string;
  /** Saved UI language (null = not chosen yet) */
  language: Locale | null;
  pageIds: number[];
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  disabled: number;
  session_version: number;
  last_login_at: string | null;
  created_at: string;
  language: string | null;
}

function toUser(r: UserRow, pageIds: number[]): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    isAdmin: !!r.is_admin,
    disabled: !!r.disabled,
    sessionVersion: r.session_version,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
    language: isLocale(r.language) ? r.language : null,
    pageIds,
  };
}

function userPageIds(userId: number): number[] {
  return (getDb().prepare('SELECT page_id FROM user_pages WHERE user_id = ?').all(userId) as { page_id: number }[]).map(
    (r) => r.page_id,
  );
}

export function listUsers(): User[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all() as UserRow[];
  const links = db.prepare('SELECT user_id, page_id FROM user_pages').all() as { user_id: number; page_id: number }[];
  return rows.map((r) => toUser(r, links.filter((l) => l.user_id === r.id).map((l) => l.page_id)));
}

export function getUser(id: number): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return r ? toUser(r, userPageIds(r.id)) : null;
}

/** Returns user + password hash for login (username is case-insensitive). */
export function findUserForLogin(username: string): { user: User; passwordHash: string } | null {
  const r = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  return r ? { user: toUser(r, userPageIds(r.id)), passwordHash: r.password_hash } : null;
}

export function touchUserLogin(id: number) {
  getDb().prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
}

export function setUserLanguage(id: number, language: Locale) {
  getDb().prepare('UPDATE users SET language = ? WHERE id = ?').run(language, id);
}

export interface UserInput {
  username?: string;
  displayName?: string;
  passwordHash?: string;
  isAdmin?: boolean;
  disabled?: boolean;
  pageIds?: number[];
}

function setUserPages(db: Database.Database, userId: number, pageIds: number[]) {
  db.prepare('DELETE FROM user_pages WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT OR IGNORE INTO user_pages (user_id, page_id) SELECT ?, id FROM status_pages WHERE id = ?');
  for (const id of Array.from(new Set(pageIds))) ins.run(userId, id);
}

export function createUser(input: Required<Pick<UserInput, 'username' | 'passwordHash'>> & UserInput): User {
  const db = getDb();
  const id = db.transaction(() => {
    const res = db
      .prepare('INSERT INTO users (username, display_name, password_hash, is_admin, disabled) VALUES (?, ?, ?, ?, ?)')
      .run(input.username, input.displayName ?? '', input.passwordHash, input.isAdmin ? 1 : 0, input.disabled ? 1 : 0);
    const newId = Number(res.lastInsertRowid);
    setUserPages(db, newId, input.pageIds ?? []);
    return newId;
  })();
  return getUser(id)!;
}

export function updateUser(id: number, input: UserInput): User | null {
  const db = getDb();
  const ex = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!ex) return null;
  // Password change, disabling or role change end existing sessions
  const bump =
    input.passwordHash !== undefined ||
    (input.disabled !== undefined && input.disabled !== !!ex.disabled) ||
    (input.isAdmin !== undefined && input.isAdmin !== !!ex.is_admin);
  db.transaction(() => {
    db.prepare(
      `UPDATE users SET username = ?, display_name = ?, password_hash = ?, is_admin = ?, disabled = ?,
         session_version = session_version + ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(
      input.username ?? ex.username,
      input.displayName ?? ex.display_name,
      input.passwordHash ?? ex.password_hash,
      input.isAdmin === undefined ? ex.is_admin : input.isAdmin ? 1 : 0,
      input.disabled === undefined ? ex.disabled : input.disabled ? 1 : 0,
      bump ? 1 : 0,
      id,
    );
    if (input.pageIds) setUserPages(db, id, input.pageIds);
  })();
  return getUser(id);
}

export function deleteUser(id: number): boolean {
  getDb().prepare('DELETE FROM dashboard_layouts WHERE user_id = ?').run(id);
  return getDb().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

export function countActiveAdmins(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND disabled = 0').get() as { n: number }).n;
}

// --- Status pages --------------------------------------------------------------
export interface StatusPage {
  id: number;
  site: string;
  slug: string;
  title: string;
  description: string;
  showWan: boolean;
  isPublic: boolean;
  sortOrder: number;
  groupIds: number[];
  deviceGroupIds: number[];
}

export interface StatusPageInput {
  site?: string;
  slug?: string;
  title?: string;
  description?: string;
  showWan?: boolean;
  isPublic?: boolean;
  groupIds?: number[];
  deviceGroupIds?: number[];
}

interface StatusPageRow {
  id: number;
  site: string;
  slug: string;
  title: string;
  description: string;
  show_wan: number;
  is_public: number;
  sort_order: number;
}

function loadPages(where: string, ...args: unknown[]): StatusPage[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM status_pages ${where} ORDER BY sort_order ASC, title COLLATE NOCASE`).all(...args) as StatusPageRow[];
  if (!rows.length) return [];
  const ng = db.prepare('SELECT page_id, group_id FROM status_page_groups').all() as { page_id: number; group_id: number }[];
  const dg = db.prepare('SELECT page_id, group_id FROM status_page_device_groups').all() as { page_id: number; group_id: number }[];
  return rows.map((r) => ({
    id: r.id,
    site: r.site,
    slug: r.slug,
    title: r.title,
    description: r.description,
    showWan: !!r.show_wan,
    isPublic: !!r.is_public,
    sortOrder: r.sort_order,
    groupIds: ng.filter((x) => x.page_id === r.id).map((x) => x.group_id),
    deviceGroupIds: dg.filter((x) => x.page_id === r.id).map((x) => x.group_id),
  }));
}

export function listStatusPages(): StatusPage[] {
  return loadPages('');
}

export function getStatusPage(id: number): StatusPage | null {
  return loadPages('WHERE id = ?', id)[0] ?? null;
}

export function getStatusPageBySlug(slug: string): StatusPage | null {
  return loadPages('WHERE slug = ?', slug)[0] ?? null;
}

export function listStatusPagesForUser(userId: number): StatusPage[] {
  return loadPages('WHERE id IN (SELECT page_id FROM user_pages WHERE user_id = ?)', userId);
}

function setPageMembers(db: Database.Database, pageId: number, site: string, input: StatusPageInput) {
  // Only accept groups of the same site
  if (input.groupIds) {
    db.prepare('DELETE FROM status_page_groups WHERE page_id = ?').run(pageId);
    const ins = db.prepare('INSERT OR IGNORE INTO status_page_groups (page_id, group_id) SELECT ?, id FROM network_groups WHERE id = ? AND site = ?');
    for (const id of Array.from(new Set(input.groupIds))) ins.run(pageId, id, site);
  }
  if (input.deviceGroupIds) {
    db.prepare('DELETE FROM status_page_device_groups WHERE page_id = ?').run(pageId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO status_page_device_groups (page_id, group_id) SELECT ?, id FROM device_groups WHERE id = ? AND site = ?',
    );
    for (const id of Array.from(new Set(input.deviceGroupIds))) ins.run(pageId, id, site);
  }
}

export function createStatusPage(input: Required<Pick<StatusPageInput, 'site' | 'slug' | 'title'>> & StatusPageInput): StatusPage {
  const db = getDb();
  const id = db.transaction(() => {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM status_pages').get() as { m: number };
    const res = db
      .prepare('INSERT INTO status_pages (site, slug, title, description, show_wan, is_public, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(input.site, input.slug, input.title, input.description ?? '', input.showWan ? 1 : 0, input.isPublic ? 1 : 0, max.m + 1);
    const newId = Number(res.lastInsertRowid);
    setPageMembers(db, newId, input.site, input);
    return newId;
  })();
  return getStatusPage(id)!;
}

export function updateStatusPage(id: number, input: StatusPageInput): StatusPage | null {
  const db = getDb();
  const ex = db.prepare('SELECT * FROM status_pages WHERE id = ?').get(id) as StatusPageRow | undefined;
  if (!ex) return null;
  const site = input.site ?? ex.site;
  db.transaction(() => {
    db.prepare(
      `UPDATE status_pages SET site = ?, slug = ?, title = ?, description = ?, show_wan = ?, is_public = ?,
         updated_at = datetime('now') WHERE id = ?`,
    ).run(
      site,
      input.slug ?? ex.slug,
      input.title ?? ex.title,
      input.description ?? ex.description,
      input.showWan === undefined ? ex.show_wan : input.showWan ? 1 : 0,
      input.isPublic === undefined ? ex.is_public : input.isPublic ? 1 : 0,
      id,
    );
    // After a site change the old groups no longer fit
    const members = site !== ex.site ? { groupIds: input.groupIds ?? [], deviceGroupIds: input.deviceGroupIds ?? [] } : input;
    setPageMembers(db, id, site, members);
  })();
  return getStatusPage(id);
}

export function deleteStatusPage(id: number): boolean {
  return getDb().prepare('DELETE FROM status_pages WHERE id = ?').run(id).changes > 0;
}

// --- Tile layouts -------------------------------------------------------------
/** user_id 0 stands for the default layout an admin sets for everyone. */
export const DEFAULT_LAYOUT_OWNER = 0;

export function getLayout(userId: number, scope: string): TileLayout | null {
  const row = getDb().prepare('SELECT layout FROM dashboard_layouts WHERE user_id = ? AND scope = ?').get(userId, scope) as { layout: string } | undefined;
  if (!row) return null;
  try {
    return parseLayout(JSON.parse(row.layout));
  } catch {
    return null;
  }
}

export function saveLayout(userId: number, scope: string, layout: TileLayout) {
  getDb()
    .prepare(
      `INSERT INTO dashboard_layouts (user_id, scope, layout, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (user_id, scope) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`,
    )
    .run(userId, scope, JSON.stringify(layout));
}

export function deleteLayout(userId: number, scope: string) {
  getDb().prepare('DELETE FROM dashboard_layouts WHERE user_id = ? AND scope = ?').run(userId, scope);
}
