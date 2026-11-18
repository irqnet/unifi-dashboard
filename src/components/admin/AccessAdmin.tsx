'use client';

import clsx from 'clsx';
import { Check, ExternalLink, Globe, Loader2, Lock, Pencil, Plus, ShieldCheck, Trash2, Users, X, LayoutDashboard } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { SiteInfo } from '@/lib/views';
import { Button, Panel, SectionTitle, Toggle } from '../ui/primitives';

type Api = <T>(url: string, init?: RequestInit) => Promise<{ data?: T; error?: string }>;

interface StatusPage {
  id: number;
  site: string;
  slug: string;
  title: string;
  description: string;
  showWan: boolean;
  isPublic: boolean;
  groupIds: number[];
  deviceGroupIds: number[];
}

interface UserRow {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  disabled: boolean;
  lastLoginAt: string | null;
  pageIds: number[];
}

interface GroupRef {
  id: number;
  name: string;
  color: string;
  hidden: boolean;
}

type PageDraft = Omit<StatusPage, 'id' | 'site'>;
const EMPTY_PAGE: PageDraft = { slug: '', title: '', description: '', showWan: false, isPublic: false, groupIds: [], deviceGroupIds: [] };

type UserDraft = Omit<UserRow, 'id' | 'lastLoginAt'> & { password: string };
const EMPTY_USER: UserDraft = { username: '', displayName: '', isAdmin: false, disabled: false, pageIds: [], password: '' };

const label = 'mb-1 block text-xs font-medium uppercase tracking-wider text-noc-muted';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

function CheckList<T extends { id: number }>({
  items,
  selected,
  onChange,
  render,
  empty,
}: {
  items: T[];
  selected: number[];
  onChange: (ids: number[]) => void;
  render: (item: T) => React.ReactNode;
  empty: string;
}) {
  if (!items.length) return <p className="rounded-lg border border-dashed border-noc-line p-3 text-sm text-noc-muted">{empty}</p>;
  return (
    <div className="grid max-h-60 gap-1.5 overflow-y-auto rounded-lg border border-noc-line bg-noc-bg p-2 sm:grid-cols-2">
      {items.map((it) => {
        const checked = selected.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(checked ? selected.filter((x) => x !== it.id) : [...selected, it.id])}
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
            <span className="min-w-0">{render(it)}</span>
          </button>
        );
      })}
    </div>
  );
}

function GroupLabel({ g }: { g: GroupRef }) {
  return (
    <span className="flex items-center gap-1.5 truncate text-noc-text">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
      {g.name}
      {g.hidden && <span className="text-[10px] text-noc-muted">(im Dashboard verborgen)</span>}
    </span>
  );
}

// --- Statusseiten-Editor -----------------------------------------------------------
function PageEditor({
  initial,
  isNew,
  groups,
  deviceGroups,
  onSave,
  onCancel,
}: {
  initial: PageDraft;
  isNew: boolean;
  groups: GroupRef[];
  deviceGroups: GroupRef[];
  onSave: (d: PageDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PageDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PageDraft>(k: K, v: PageDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return setError('Bitte einen Titel angeben');
    if (!draft.slug) return setError('Bitte eine Adresse angeben');
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
          <label className={label}>Titel</label>
          <input
            className="w-full"
            value={draft.title}
            maxLength={80}
            autoFocus
            placeholder="z. B. Gebäude A"
            onChange={(e) => {
              const title = e.target.value;
              setDraft((d) => ({ ...d, title, slug: slugTouched ? d.slug : slugify(title) }));
            }}
          />
        </div>
        <div>
          <label className={label}>Adresse</label>
          <div className="flex items-center rounded-lg border border-noc-line bg-noc-bg pl-2.5 text-sm">
            <span className="text-noc-muted">/s/</span>
            <input
              className="w-full !border-0 !bg-transparent !pl-0.5 !ring-0"
              value={draft.slug}
              maxLength={64}
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <label className={label}>Beschreibung (optional)</label>
          <input className="w-full" value={draft.description} maxLength={300} onChange={(e) => set('description', e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <Toggle checked={draft.showWan} onChange={(v) => set('showWan', v)} label="WAN-Durchsatz & Gateway anzeigen" />
        <Toggle checked={draft.isPublic} onChange={(v) => set('isPublic', v)} label="Öffentlich (ohne Login, z. B. Wandmonitor)" />
      </div>
      <div>
        <span className={label}>VLAN-Gruppen ({draft.groupIds.length})</span>
        <CheckList
          items={groups}
          selected={draft.groupIds}
          onChange={(ids) => set('groupIds', ids)}
          render={(g) => <GroupLabel g={g} />}
          empty="Für diesen Standort gibt es noch keine Netzwerk-Gruppen."
        />
      </div>
      <div>
        <span className={label}>Geräte-Gruppen ({draft.deviceGroupIds.length})</span>
        <CheckList
          items={deviceGroups}
          selected={draft.deviceGroupIds}
          onChange={(ids) => set('deviceGroupIds', ids)}
          render={(g) => <GroupLabel g={g} />}
          empty="Für diesen Standort gibt es noch keine Geräte-Gruppen."
        />
      </div>
      {draft.isPublic && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Öffentliche Seiten sind ohne Turnstile und ohne Login für jeden mit der Adresse sichtbar. Client-MACs und die WAN-IP werden
          maskiert, Client-Namen bleiben sichtbar, sofern die Gruppe nicht anonymisiert ist.
        </p>
      )}
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

// --- Benutzer-Editor ---------------------------------------------------------------
function UserEditor({
  initial,
  isNew,
  isSelf,
  pages,
  sites,
  onSave,
  onCancel,
}: {
  initial: UserDraft;
  isNew: boolean;
  isSelf: boolean;
  pages: StatusPage[];
  sites: SiteInfo[];
  onSave: (d: UserDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<UserDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof UserDraft>(k: K, v: UserDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const siteName = (s: string) => sites.find((x) => x.name === s)?.desc ?? s;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.username.trim()) return setError('Bitte einen Benutzernamen angeben');
    if (isNew && draft.password.length < 8) return setError('Passwort: mindestens 8 Zeichen');
    if (!isNew && draft.password && draft.password.length < 8) return setError('Passwort: mindestens 8 Zeichen');
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-sky-500/40 bg-noc-panel p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className={label}>Benutzername</label>
          <input
            className="w-full"
            value={draft.username}
            maxLength={64}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => set('username', e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Anzeigename (optional)</label>
          <input className="w-full" value={draft.displayName} maxLength={80} onChange={(e) => set('displayName', e.target.value)} />
        </div>
        <div>
          <label className={label}>{isNew ? 'Passwort' : 'Neues Passwort (optional)'}</label>
          <input
            className="w-full"
            type="password"
            autoComplete="new-password"
            value={draft.password}
            maxLength={200}
            placeholder={isNew ? 'mind. 8 Zeichen' : 'leer = unverändert'}
            onChange={(e) => set('password', e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <Toggle checked={draft.isAdmin} onChange={(v) => set('isAdmin', v)} disabled={isSelf} label="Admin (sieht und verwaltet alles)" />
        <Toggle checked={draft.disabled} onChange={(v) => set('disabled', v)} disabled={isSelf} label="Gesperrt" />
      </div>
      {!draft.isAdmin && (
        <div>
          <span className={label}>Freigegebene Statusseiten ({draft.pageIds.length})</span>
          <CheckList
            items={pages}
            selected={draft.pageIds}
            onChange={(ids) => set('pageIds', ids)}
            render={(p) => (
              <>
                <span className="block truncate text-noc-text">{p.title}</span>
                <span className="block truncate font-mono text-[11px] text-noc-muted">
                  /s/{p.slug}
                  {sites.length > 1 && ` · ${siteName(p.site)}`}
                </span>
              </>
            )}
            empty="Lege zuerst eine Statusseite an."
          />
        </div>
      )}
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

// --- Bereich im Admin ----------------------------------------------------------------
export function AccessAdmin({
  site,
  sites,
  api,
  reloadSignal,
  onError,
}: {
  site: string;
  sites: SiteInfo[];
  api: Api;
  reloadSignal: number;
  onError: (e: string | null) => void;
}) {
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupRef[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<GroupRef[]>([]);
  const [sharedAccess, setSharedAccess] = useState(true);
  const [editPage, setEditPage] = useState<number | 'new' | null>(null);
  const [editUser, setEditUser] = useState<number | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    const q = `?site=${encodeURIComponent(site)}`;
    const [p, u, g, d, s] = await Promise.all([
      api<{ pages: StatusPage[] }>('/api/admin/status-pages'),
      api<{ users: UserRow[]; currentUserId: number | null }>('/api/admin/users'),
      api<{ groups: GroupRef[] }>(`/api/admin/groups${q}`),
      api<{ groups: GroupRef[] }>(`/api/admin/device-groups${q}`),
      api<{ settings: { allowSharedAccess: boolean } }>('/api/admin/settings'),
    ]);
    if (p.data) setPages(p.data.pages);
    if (u.data) {
      setUsers(u.data.users);
      setCurrentUserId(u.data.currentUserId);
    }
    if (g.data) setGroups(g.data.groups);
    if (d.data) setDeviceGroups(d.data.groups);
    if (s.data) setSharedAccess(s.data.settings.allowSharedAccess);
    const err = p.error ?? u.error ?? g.error ?? d.error ?? s.error;
    if (err) onError(err);
    setLoading(false);
  }, [site, api, onError]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  const savePage = async (id: number | 'new', draft: PageDraft) => {
    const res =
      id === 'new'
        ? await api('/api/admin/status-pages', { method: 'POST', body: JSON.stringify({ ...draft, site }) })
        : await api(`/api/admin/status-pages/${id}`, { method: 'PUT', body: JSON.stringify(draft) });
    if (res.error) return res.error;
    setEditPage(null);
    await reload();
    return null;
  };

  const saveUser = async (id: number | 'new', draft: UserDraft) => {
    const body = { ...draft, pageIds: draft.isAdmin ? [] : draft.pageIds };
    const res =
      id === 'new'
        ? await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
        : await api(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    if (res.error) return res.error;
    setEditUser(null);
    await reload();
    return null;
  };

  const remove = async (kind: 'page' | 'user', id: number) => {
    const res = await api(kind === 'page' ? `/api/admin/status-pages/${id}` : `/api/admin/users/${id}`, { method: 'DELETE' });
    onError(res.error ?? null);
    setConfirm(null);
    await reload();
  };

  const toggleShared = async (v: boolean) => {
    const res = await api<{ settings: { allowSharedAccess: boolean } }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ allowSharedAccess: v }),
    });
    if (res.error) onError(res.error);
    else setSharedAccess(v);
  };

  const sitePages = pages.filter((p) => p.site === site);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const devGroupById = new Map(deviceGroups.map((g) => [g.id, g]));
  const pageById = new Map(pages.map((p) => [p.id, p]));

  return (
    <>
      {/* ---------------- Statusseiten ---------------- */}
      <section>
        <SectionTitle
          icon={<LayoutDashboard className="h-4 w-4" />}
          right={
            editPage !== 'new' && (
              <Button variant="primary" onClick={() => setEditPage('new')}>
                <Plus className="h-4 w-4" /> Neue Statusseite
              </Button>
            )
          }
        >
          Statusseiten
        </SectionTitle>
        <p className="mb-3 text-sm text-noc-muted">
          Eine Statusseite zeigt nur die gewählten VLAN- und Geräte-Gruppen dieses Standorts. Benutzer sehen ausschließlich die ihnen
          freigegebenen Seiten.
        </p>
        <div className="space-y-3">
          {editPage === 'new' && (
            <PageEditor
              initial={EMPTY_PAGE}
              isNew
              groups={groups}
              deviceGroups={deviceGroups}
              onSave={(d) => savePage('new', d)}
              onCancel={() => setEditPage(null)}
            />
          )}
          {!loading && sitePages.length === 0 && editPage !== 'new' && (
            <div className="rounded-xl border border-dashed border-noc-line p-6 text-center text-sm text-noc-muted">
              Noch keine Statusseiten für diesen Standort.
            </div>
          )}
          {sitePages.map((p) =>
            editPage === p.id ? (
              <PageEditor
                key={p.id}
                initial={p}
                isNew={false}
                groups={groups}
                deviceGroups={deviceGroups}
                onSave={(d) => savePage(p.id, d)}
                onCancel={() => setEditPage(null)}
              />
            ) : (
              <Panel key={p.id} className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-noc-text">{p.title}</span>
                    <a
                      href={`/s/${p.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-sky-300 hover:underline"
                    >
                      /s/{p.slug} <ExternalLink className="h-3 w-3" />
                    </a>
                    {p.isPublic ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300 ring-1 ring-inset ring-amber-500/30">
                        <Globe className="h-3 w-3" /> öffentlich
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-inset ring-slate-500/30">
                        <Lock className="h-3 w-3" /> Login
                      </span>
                    )}
                    {p.showWan && <span className="text-[11px] text-noc-muted">+ WAN</span>}
                  </div>
                  {p.description && <div className="mt-0.5 text-xs text-noc-muted">{p.description}</div>}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {p.groupIds.map((id) => groupById.get(id)).filter(Boolean).map((g) => (
                      <span key={`n${g!.id}`} className="inline-flex items-center gap-1 rounded-md border border-noc-line px-1.5 py-0.5 text-noc-text">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: g!.color }} />
                        {g!.name}
                      </span>
                    ))}
                    {p.deviceGroupIds.map((id) => devGroupById.get(id)).filter(Boolean).map((g) => (
                      <span key={`d${g!.id}`} className="inline-flex items-center gap-1 rounded-md border border-dashed border-noc-line px-1.5 py-0.5 text-noc-text">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: g!.color }} />
                        {g!.name}
                      </span>
                    ))}
                    {!p.groupIds.length && !p.deviceGroupIds.length && <span className="text-noc-muted">Keine Gruppen zugeordnet</span>}
                  </div>
                  <div className="mt-1.5 text-[11px] text-noc-muted">
                    Benutzer: {users.filter((u) => u.pageIds.includes(p.id)).map((u) => u.username).join(', ') || '–'}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {confirm === `page:${p.id}` ? (
                    <>
                      <Button variant="danger" onClick={() => void remove('page', p.id)}>
                        Löschen?
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirm(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => setEditPage(p.id)} title="Bearbeiten">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirm(`page:${p.id}`)} title="Löschen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </Panel>
            ),
          )}
        </div>
      </section>

      {/* ---------------- Benutzer ---------------- */}
      <section>
        <SectionTitle
          icon={<Users className="h-4 w-4" />}
          right={
            editUser !== 'new' && (
              <Button variant="primary" onClick={() => setEditUser('new')}>
                <Plus className="h-4 w-4" /> Neuer Benutzer
              </Button>
            )
          }
        >
          Benutzer
        </SectionTitle>
        <Panel className="mb-3 p-4">
          <Toggle
            checked={sharedAccess}
            onChange={(v) => void toggleShared(v)}
            label="Gemeinsamer Zugang ohne Benutzerkonto (Zugangspasswort/Turnstile) sieht die Gesamtansicht"
          />
          <p className="mt-1.5 pl-11 text-xs text-noc-muted">
            Ausschalten, damit nur noch Benutzerkonten Zugriff haben. Dafür ist mindestens ein aktives Admin-Konto nötig.
          </p>
        </Panel>
        <div className="space-y-3">
          {editUser === 'new' && (
            <UserEditor
              initial={EMPTY_USER}
              isNew
              isSelf={false}
              pages={pages}
              sites={sites}
              onSave={(d) => saveUser('new', d)}
              onCancel={() => setEditUser(null)}
            />
          )}
          {editUser !== null && editUser !== 'new' && (() => {
            const u = users.find((x) => x.id === editUser);
            return u ? (
              <UserEditor
                key={u.id}
                initial={{ ...u, password: '' }}
                isNew={false}
                isSelf={u.id === currentUserId}
                pages={pages}
                sites={sites}
                onSave={(d) => saveUser(u.id, d)}
                onCancel={() => setEditUser(null)}
              />
            ) : null;
          })()}
          {!loading && users.length === 0 && editUser !== 'new' && (
            <div className="rounded-xl border border-dashed border-noc-line p-6 text-center text-sm text-noc-muted">Noch keine Benutzer angelegt.</div>
          )}
          {users.length > 0 && (
            <Panel className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-noc-line text-left text-[11px] uppercase tracking-wider text-noc-muted">
                    <th className="px-4 py-2 font-medium">Benutzer</th>
                    <th className="px-4 py-2 font-medium">Rolle</th>
                    <th className="px-4 py-2 font-medium">Statusseiten</th>
                    <th className="px-4 py-2 font-medium">Letzter Login</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={clsx('border-b border-noc-line/60 last:border-0', u.disabled && 'opacity-50')}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-noc-text">
                          {u.username}
                          {u.id === currentUserId && <span className="ml-1.5 text-[11px] text-noc-muted">(du)</span>}
                        </div>
                        {u.displayName && <div className="text-xs text-noc-muted">{u.displayName}</div>}
                      </td>
                      <td className="px-4 py-2">
                        {u.isAdmin ? (
                          <span className="inline-flex items-center gap-1 text-sky-300">
                            <ShieldCheck className="h-3.5 w-3.5" /> Admin
                          </span>
                        ) : (
                          <span className="text-noc-text">Betrachter</span>
                        )}
                        {u.disabled && <span className="ml-1.5 text-xs text-rose-300">gesperrt</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-noc-text">
                        {u.isAdmin ? (
                          <span className="text-noc-muted">alle</span>
                        ) : (
                          u.pageIds.map((id) => pageById.get(id)?.title).filter(Boolean).join(', ') || <span className="text-noc-muted">keine</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-noc-muted">
                        {u.lastLoginAt ? new Date(`${u.lastLoginAt.replace(' ', 'T')}Z`).toLocaleString('de-DE') : '–'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          {confirm === `user:${u.id}` ? (
                            <>
                              <Button variant="danger" onClick={() => void remove('user', u.id)}>
                                Löschen?
                              </Button>
                              <Button variant="ghost" onClick={() => setConfirm(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" onClick={() => setEditUser(u.id)} title="Bearbeiten">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => setConfirm(`user:${u.id}`)}
                                disabled={u.id === currentUserId}
                                title="Löschen"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </div>
      </section>
    </>
  );
}
