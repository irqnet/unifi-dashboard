'use client';

import { ExternalLink, Globe, Lock, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { SiteInfo } from '@/lib/views';
import {
  Banner,
  CheckRow,
  DeleteRow,
  EmptyRow,
  FieldRow,
  Group,
  LinkButton,
  LoadingRow,
  PageHeader,
  Pill,
  PrimaryButton,
  Row,
  Sheet,
  SwitchRow,
  TextInput,
  type Api,
} from './ui';

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

const AVATAR_COLORS = ['#0a84ff', '#ff9f0a', '#30b0c7', '#bf5af2', '#ff375f', '#32d74b', '#64d2ff', '#ffd60a'];

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

function toggleId(list: number[], id: number) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function fmtLogin(ts: string | null) {
  if (!ts) return 'Noch nie angemeldet';
  const d = new Date(`${ts.replace(' ', 'T')}Z`);
  return `Zuletzt angemeldet ${d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}

// --- Statusseiten --------------------------------------------------------------------

function PageEditor({
  initial,
  isNew,
  groups,
  deviceGroups,
  users,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: PageDraft;
  isNew: boolean;
  groups: GroupRef[];
  deviceGroups: GroupRef[];
  users: UserRow[];
  onSave: (d: PageDraft) => Promise<string | null>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PageDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof PageDraft>(k: K, v: PageDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    if (!draft.title.trim()) return setError('Gib der Statusseite einen Titel.');
    if (!draft.slug) return setError('Gib eine Adresse an, zum Beispiel „gebaeude-a“.');
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={isNew ? 'Neue Statusseite' : 'Statusseite bearbeiten'} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <Group>
        <FieldRow label="Titel" htmlFor="sp-title">
          <TextInput
            id="sp-title"
            value={draft.title}
            maxLength={80}
            placeholder="z. B. Gebäude A"
            onChange={(e) => {
              const title = e.target.value;
              setDraft((d) => ({ ...d, title, slug: slugTouched ? d.slug : slugify(title) }));
            }}
          />
        </FieldRow>
        <FieldRow label="Adresse" htmlFor="sp-slug">
          <div className="flex items-center text-sm">
            <span className="text-noc-muted">/s/</span>
            <TextInput
              id="sp-slug"
              value={draft.slug}
              maxLength={64}
              className="font-mono"
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
            />
          </div>
        </FieldRow>
        <FieldRow label="Beschreibung" htmlFor="sp-desc">
          <TextInput id="sp-desc" value={draft.description} maxLength={300} placeholder="Optional" onChange={(e) => set('description', e.target.value)} />
        </FieldRow>
      </Group>

      <Group
        footer={
          draft.isPublic
            ? 'Jeder mit der Adresse sieht die Seite, ohne Login und ohne Bot-Prüfung. MACs und WAN-IP bleiben maskiert, Client-Namen sind sichtbar, sofern die Gruppe nicht anonymisiert ist.'
            : undefined
        }
      >
        <SwitchRow title="WAN-Durchsatz und Gateway zeigen" checked={draft.showWan} onChange={(v) => set('showWan', v)} />
        <SwitchRow title="Öffentlich" subtitle="Ohne Login erreichbar, z. B. für einen Wandmonitor." checked={draft.isPublic} onChange={(v) => set('isPublic', v)} />
      </Group>

      <Group title="Netzwerk-Gruppen" aside={`${draft.groupIds.length} ausgewählt`}>
        {groups.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">An diesem Standort gibt es noch keine Netzwerk-Gruppen.</p>}
        {groups.map((g) => (
          <CheckRow
            key={g.id}
            checked={draft.groupIds.includes(g.id)}
            onToggle={() => set('groupIds', toggleId(draft.groupIds, g.id))}
            icon={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />}
            title={g.name}
            subtitle={g.hidden ? 'Im Dashboard ausgeblendet' : undefined}
          />
        ))}
      </Group>

      <Group title="Geräte-Gruppen" aside={`${draft.deviceGroupIds.length} ausgewählt`}>
        {deviceGroups.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">An diesem Standort gibt es noch keine Geräte-Gruppen.</p>}
        {deviceGroups.map((g) => (
          <CheckRow
            key={g.id}
            checked={draft.deviceGroupIds.includes(g.id)}
            onToggle={() => set('deviceGroupIds', toggleId(draft.deviceGroupIds, g.id))}
            icon={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />}
            title={g.name}
            subtitle={g.hidden ? 'Im Dashboard ausgeblendet' : undefined}
          />
        ))}
      </Group>

      {!isNew && (
        <Group title="Freigegeben für">
          <Row title={users.length ? users.map((u) => u.displayName || u.username).join(', ') : 'Noch kein Benutzer'} subtitle="Freigaben verwaltest du unter Benutzer." />
        </Group>
      )}

      {!isNew && onDelete && (
        <DeleteRow
          label="Statusseite löschen"
          confirming={confirmDelete}
          onAsk={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete()}
          hint="Die Adresse funktioniert danach nicht mehr. Die Gruppen bleiben erhalten."
        />
      )}
    </Sheet>
  );
}

export function StatusPagesSection({
  site,
  api,
  reloadSignal,
  onError,
  onChanged,
}: {
  site: string;
  api: Api;
  reloadSignal: number;
  onError: (e: string | null) => void;
  onChanged: () => void;
}) {
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupRef[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<GroupRef[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    const q = `?site=${encodeURIComponent(site)}`;
    const [p, u, g, d] = await Promise.all([
      api<{ pages: StatusPage[] }>('/api/admin/status-pages'),
      api<{ users: UserRow[] }>('/api/admin/users'),
      api<{ groups: GroupRef[] }>(`/api/admin/groups${q}`),
      api<{ groups: GroupRef[] }>(`/api/admin/device-groups${q}`),
    ]);
    if (p.data) setPages(p.data.pages);
    if (u.data) setUsers(u.data.users);
    if (g.data) setGroups(g.data.groups);
    if (d.data) setDeviceGroups(d.data.groups);
    const err = p.error ?? u.error ?? g.error ?? d.error;
    if (err) onError(err);
    setLoading(false);
  }, [site, api, onError]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  const save = async (id: number | 'new', draft: PageDraft) => {
    const res =
      id === 'new'
        ? await api('/api/admin/status-pages', { method: 'POST', body: JSON.stringify({ ...draft, site }) })
        : await api(`/api/admin/status-pages/${id}`, { method: 'PUT', body: JSON.stringify(draft) });
    if (res.error) return res.error;
    setEditing(null);
    await reload();
    onChanged();
    return null;
  };

  const remove = async (id: number) => {
    const res = await api(`/api/admin/status-pages/${id}`, { method: 'DELETE' });
    if (res.error) onError(res.error);
    setEditing(null);
    await reload();
    onChanged();
  };

  const sitePages = pages.filter((p) => p.site === site);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const devGroupById = new Map(deviceGroups.map((g) => [g.id, g]));
  const editPage = typeof editing === 'number' ? sitePages.find((p) => p.id === editing) : undefined;

  return (
    <>
      <PageHeader
        title="Statusseiten"
        lead="Eine Statusseite zeigt nur die gewählten Gruppen dieses Standorts unter einer eigenen Adresse. Benutzer sehen nur die Seiten, die du ihnen freigibst."
        action={
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Statusseite
          </PrimaryButton>
        }
      />

      <Group title="Seiten">
        {loading && !sitePages.length && <LoadingRow />}
        {!loading && !sitePages.length && (
          <EmptyRow action={<LinkButton onClick={() => setEditing('new')}>Erste Statusseite anlegen</LinkButton>}>
            Noch keine Statusseiten an diesem Standort. Lege zum Beispiel eine Seite pro Gebäude oder Mieter an.
          </EmptyRow>
        )}
        {sitePages.map((p) => {
          const parts = [
            ...p.groupIds.map((id) => groupById.get(id)?.name),
            ...p.deviceGroupIds.map((id) => devGroupById.get(id)?.name),
          ].filter(Boolean) as string[];
          const pageUsers = users.filter((u) => u.pageIds.includes(p.id)).length;
          return (
            <div key={p.id} className="flex items-stretch">
              <Row
                className="flex-1"
                icon={
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#30b0c7]/20 text-[#64d2ff]">
                    {p.isPublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </span>
                }
                title={
                  <>
                    {p.title} <span className="ml-1 font-mono text-[12px] font-normal text-noc-muted">/s/{p.slug}</span>
                  </>
                }
                subtitle={(p.showWan ? ['WAN', ...parts] : parts).join(', ') || 'Keine Gruppen gewählt'}
                onClick={() => setEditing(p.id)}
                detail={
                  <>
                    {p.isPublic ? <Pill tone="warn">öffentlich</Pill> : null}
                    <span className="hidden sm:inline">
                      {pageUsers} Benutzer
                    </span>
                  </>
                }
              />
              <a
                href={`/s/${p.slug}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center border-l border-white/[0.06] px-3.5 text-noc-muted hover:bg-white/[0.03] hover:text-sky-300"
                title="Seite öffnen"
                aria-label={`${p.title} öffnen`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          );
        })}
      </Group>

      {editing === 'new' && (
        <PageEditor isNew initial={EMPTY_PAGE} groups={groups} deviceGroups={deviceGroups} users={[]} onSave={(d) => save('new', d)} onCancel={() => setEditing(null)} />
      )}
      {editPage && (
        <PageEditor
          key={editPage.id}
          isNew={false}
          initial={editPage}
          groups={groups}
          deviceGroups={deviceGroups}
          users={users.filter((u) => u.pageIds.includes(editPage.id))}
          onSave={(d) => save(editPage.id, d)}
          onDelete={() => remove(editPage.id)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

// --- Benutzer -----------------------------------------------------------------------

function UserEditor({
  initial,
  isNew,
  isSelf,
  pages,
  sites,
  lastLoginAt,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: UserDraft;
  isNew: boolean;
  isSelf: boolean;
  pages: StatusPage[];
  sites: SiteInfo[];
  lastLoginAt?: string | null;
  onSave: (d: UserDraft) => Promise<string | null>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<UserDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof UserDraft>(k: K, v: UserDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const siteName = (s: string) => sites.find((x) => x.name === s)?.desc ?? s;

  async function submit() {
    if (!draft.username.trim()) return setError('Gib einen Benutzernamen an.');
    if ((isNew || draft.password) && draft.password.length < 8) return setError('Das Passwort braucht mindestens 8 Zeichen.');
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={isNew ? 'Neuer Benutzer' : 'Benutzer bearbeiten'} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <Group footer={!isNew ? fmtLogin(lastLoginAt ?? null) : undefined}>
        <FieldRow label="Benutzername" htmlFor="u-name">
          <TextInput
            id="u-name"
            value={draft.username}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => set('username', e.target.value)}
          />
        </FieldRow>
        <FieldRow label="Anzeigename" htmlFor="u-display">
          <TextInput id="u-display" value={draft.displayName} maxLength={80} placeholder="Optional" onChange={(e) => set('displayName', e.target.value)} />
        </FieldRow>
        <FieldRow label={isNew ? 'Passwort' : 'Neues Passwort'} htmlFor="u-pw">
          <TextInput
            id="u-pw"
            type="password"
            autoComplete="new-password"
            value={draft.password}
            maxLength={200}
            placeholder={isNew ? 'Mindestens 8 Zeichen' : 'Leer lassen, um es zu behalten'}
            onChange={(e) => set('password', e.target.value)}
          />
        </FieldRow>
      </Group>

      <Group footer={isSelf ? 'Rolle und Sperre deines eigenen Kontos kannst du nicht ändern.' : 'Ändern sich Passwort, Rolle oder Sperre, werden laufende Sitzungen sofort beendet.'}>
        <SwitchRow title="Admin" subtitle="Sieht und verwaltet alles." checked={draft.isAdmin} onChange={(v) => set('isAdmin', v)} disabled={isSelf} />
        <SwitchRow title="Gesperrt" subtitle="Anmeldung nicht möglich." checked={draft.disabled} onChange={(v) => set('disabled', v)} disabled={isSelf} />
      </Group>

      {!draft.isAdmin && (
        <Group title="Freigegebene Statusseiten" aside={`${draft.pageIds.length} ausgewählt`}>
          {pages.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">Lege zuerst unter Statusseiten eine Seite an.</p>}
          {pages.map((p) => (
            <CheckRow
              key={p.id}
              checked={draft.pageIds.includes(p.id)}
              onToggle={() => set('pageIds', toggleId(draft.pageIds, p.id))}
              title={p.title}
              subtitle={sites.length > 1 ? siteName(p.site) : undefined}
              detail={`/s/${p.slug}`}
            />
          ))}
        </Group>
      )}

      {!isNew && onDelete && (
        <DeleteRow
          label="Benutzer löschen"
          confirming={confirmDelete}
          onAsk={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete()}
          disabled={isSelf}
          hint={isSelf ? 'Dein eigenes Konto kannst du nicht löschen.' : undefined}
        />
      )}
    </Sheet>
  );
}

export function UsersSection({
  sites,
  api,
  reloadSignal,
  onError,
  onChanged,
}: {
  sites: SiteInfo[];
  api: Api;
  reloadSignal: number;
  onError: (e: string | null) => void;
  onChanged: () => void;
}) {
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [sharedAccess, setSharedAccess] = useState(true);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [p, u, s] = await Promise.all([
      api<{ pages: StatusPage[] }>('/api/admin/status-pages'),
      api<{ users: UserRow[]; currentUserId: number | null }>('/api/admin/users'),
      api<{ settings: { allowSharedAccess: boolean } }>('/api/admin/settings'),
    ]);
    if (p.data) setPages(p.data.pages);
    if (u.data) {
      setUsers(u.data.users);
      setCurrentUserId(u.data.currentUserId);
    }
    if (s.data) setSharedAccess(s.data.settings.allowSharedAccess);
    const err = p.error ?? u.error ?? s.error;
    if (err) onError(err);
    setLoading(false);
  }, [api, onError]);

  useEffect(() => {
    void reload();
  }, [reload, reloadSignal]);

  const save = async (id: number | 'new', draft: UserDraft) => {
    const body = { ...draft, pageIds: draft.isAdmin ? [] : draft.pageIds };
    const res =
      id === 'new'
        ? await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
        : await api(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    if (res.error) return res.error;
    setEditing(null);
    await reload();
    onChanged();
    return null;
  };

  const remove = async (id: number) => {
    const res = await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (res.error) onError(res.error);
    setEditing(null);
    await reload();
    onChanged();
  };

  const toggleShared = async (v: boolean) => {
    setSharedError(null);
    const res = await api<{ settings: { allowSharedAccess: boolean } }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ allowSharedAccess: v }),
    });
    if (res.error) setSharedError(res.error);
    else setSharedAccess(v);
  };

  const pageById = new Map(pages.map((p) => [p.id, p]));
  const editUser = typeof editing === 'number' ? users.find((u) => u.id === editing) : undefined;

  return (
    <>
      <PageHeader
        title="Benutzer"
        lead="Konten melden sich am Login mit Benutzername und Passwort an. Betrachter sehen nur ihre freigegebenen Statusseiten, Admins sehen alles."
        action={
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Benutzer
          </PrimaryButton>
        }
      />

      {sharedError && <Banner tone="warn">{sharedError}</Banner>}
      <Group footer="Zum Abschalten muss es mindestens ein aktives Admin-Konto geben, sonst sperrst du dich aus.">
        <SwitchRow
          title="Zugang ohne Benutzerkonto"
          subtitle="Mit dem gemeinsamen Zugangspasswort sieht man die Gesamtansicht."
          checked={sharedAccess}
          onChange={(v) => void toggleShared(v)}
        />
      </Group>

      <Group title="Konten">
        {loading && !users.length && <LoadingRow />}
        {!loading && !users.length && (
          <EmptyRow action={<LinkButton onClick={() => setEditing('new')}>Ersten Benutzer anlegen</LinkButton>}>Noch keine Benutzerkonten.</EmptyRow>
        )}
        {users.map((u, i) => {
          const name = u.displayName || u.username;
          const initials = name
            .split(/[\s._-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]!.toUpperCase())
            .join('');
          const pageNames = u.pageIds.map((id) => pageById.get(id)?.title).filter(Boolean).join(', ');
          return (
            <Row
              key={u.id}
              dim={u.disabled}
              icon={
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold text-white"
                  style={{ background: u.disabled ? '#48484a' : AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  {initials || '?'}
                </span>
              }
              title={
                <>
                  {name}
                  {u.id === currentUserId && <span className="ml-1.5 text-[12px] font-normal text-noc-muted">(du)</span>}
                </>
              }
              subtitle={u.displayName ? `@${u.username}` : fmtLogin(u.lastLoginAt)}
              onClick={() => setEditing(u.id)}
              detail={
                u.disabled ? (
                  <Pill tone="danger">gesperrt</Pill>
                ) : u.isAdmin ? (
                  <Pill tone="info">Admin</Pill>
                ) : (
                  <span className="max-w-[16rem] truncate">{pageNames || 'Keine Seite'}</span>
                )
              }
            />
          );
        })}
      </Group>

      {editing === 'new' && (
        <UserEditor isNew isSelf={false} initial={EMPTY_USER} pages={pages} sites={sites} onSave={(d) => save('new', d)} onCancel={() => setEditing(null)} />
      )}
      {editUser && (
        <UserEditor
          key={editUser.id}
          isNew={false}
          isSelf={editUser.id === currentUserId}
          initial={{ ...editUser, password: '' }}
          lastLoginAt={editUser.lastLoginAt}
          pages={pages}
          sites={sites}
          onSave={(d) => save(editUser.id, d)}
          onDelete={() => remove(editUser.id)}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  );
}

