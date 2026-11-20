'use client';

import { ExternalLink, Globe, Lock, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useI18n, useT } from '@/components/i18n/I18nProvider';
import type { TFunction } from '@/lib/i18n/translate';
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

function fmtLogin(ts: string | null, t: TFunction, tag: string) {
  if (!ts) return t('users.neverLoggedIn');
  const d = new Date(`${ts.replace(' ', 'T')}Z`);
  return t('users.lastLogin', { date: d.toLocaleString(tag, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) });
}

// --- Status pages --------------------------------------------------------------------

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
  const t = useT();
  const [draft, setDraft] = useState<PageDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof PageDraft>(k: K, v: PageDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    if (!draft.title.trim()) return setError(t('pages.titleRequired'));
    if (!draft.slug) return setError(t('pages.slugRequired'));
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={isNew ? t('pages.new') : t('pages.edit')} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <Group>
        <FieldRow label={t('pages.titleLabel')} htmlFor="sp-title">
          <TextInput
            id="sp-title"
            value={draft.title}
            maxLength={80}
            placeholder={t('pages.titlePlaceholder')}
            onChange={(e) => {
              const title = e.target.value;
              setDraft((d) => ({ ...d, title, slug: slugTouched ? d.slug : slugify(title) }));
            }}
          />
        </FieldRow>
        <FieldRow label={t('pages.slugLabel')} htmlFor="sp-slug">
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
        <FieldRow label={t('common.description')} htmlFor="sp-desc">
          <TextInput id="sp-desc" value={draft.description} maxLength={300} placeholder={t('common.optional')} onChange={(e) => set('description', e.target.value)} />
        </FieldRow>
      </Group>

      <Group
        footer={
          draft.isPublic ? t('pages.publicHint') : undefined
        }
      >
        <SwitchRow title={t('pages.showWan')} checked={draft.showWan} onChange={(v) => set('showWan', v)} />
        <SwitchRow title={t('pages.public')} subtitle={t('pages.publicSubtitle')} checked={draft.isPublic} onChange={(v) => set('isPublic', v)} />
      </Group>

      <Group title={t('pages.networkGroups')} aside={t('admin.selected', { count: draft.groupIds.length })}>
        {groups.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">{t('pages.noNetworkGroups')}</p>}
        {groups.map((g) => (
          <CheckRow
            key={g.id}
            checked={draft.groupIds.includes(g.id)}
            onToggle={() => set('groupIds', toggleId(draft.groupIds, g.id))}
            icon={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />}
            title={g.name}
            subtitle={g.hidden ? t('pages.hiddenOnDashboard') : undefined}
          />
        ))}
      </Group>

      <Group title={t('pages.deviceGroups')} aside={t('admin.selected', { count: draft.deviceGroupIds.length })}>
        {deviceGroups.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">{t('pages.noDeviceGroups')}</p>}
        {deviceGroups.map((g) => (
          <CheckRow
            key={g.id}
            checked={draft.deviceGroupIds.includes(g.id)}
            onToggle={() => set('deviceGroupIds', toggleId(draft.deviceGroupIds, g.id))}
            icon={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />}
            title={g.name}
            subtitle={g.hidden ? t('pages.hiddenOnDashboard') : undefined}
          />
        ))}
      </Group>

      {!isNew && (
        <Group title={t('pages.sharedWith')}>
          <Row title={users.length ? users.map((u) => u.displayName || u.username).join(', ') : t('pages.noUserYet')} subtitle={t('pages.sharedWithHint')} />
        </Group>
      )}

      {!isNew && onDelete && (
        <DeleteRow
          label={t('pages.delete')}
          confirming={confirmDelete}
          onAsk={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete()}
          hint={t('pages.deleteHint')}
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
  const t = useT();
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
        title={t('admin.nav.statusPages')}
        lead={t('pages.lead')}
        action={
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('header.statusPage')}
          </PrimaryButton>
        }
      />

      <Group title={t('pages.pages')}>
        {loading && !sitePages.length && <LoadingRow />}
        {!loading && !sitePages.length && (
          <EmptyRow action={<LinkButton onClick={() => setEditing('new')}>{t('pages.createFirst')}</LinkButton>}>
            {t('pages.emptyHint')}
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
                subtitle={(p.showWan ? ['WAN', ...parts] : parts).join(', ') || t('pages.noGroups')}
                onClick={() => setEditing(p.id)}
                detail={
                  <>
                    {p.isPublic ? <Pill tone="warn">{t('pages.publicPill')}</Pill> : null}
                    <span className="hidden sm:inline">{t('pages.userCount', { count: pageUsers })}</span>
                  </>
                }
              />
              <a
                href={`/s/${p.slug}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center border-l border-fg/[0.06] px-3.5 text-noc-muted hover:bg-fg/[0.03] hover:text-sky-300"
                title={t('pages.open')}
                aria-label={t('pages.openLabel', { title: p.title })}
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

// --- Users --------------------------------------------------------------------------

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
  const { t, tag } = useI18n();
  const [draft, setDraft] = useState<UserDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof UserDraft>(k: K, v: UserDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const siteName = (s: string) => sites.find((x) => x.name === s)?.desc ?? s;

  async function submit() {
    if (!draft.username.trim()) return setError(t('users.usernameRequired'));
    if ((isNew || draft.password) && draft.password.length < 8) return setError(t('users.passwordTooShort'));
    setBusy(true);
    setError(null);
    const err = await onSave(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet title={isNew ? t('users.new') : t('users.edit')} onCancel={onCancel} onSubmit={() => void submit()} busy={busy} error={error}>
      <Group footer={!isNew ? fmtLogin(lastLoginAt ?? null, t, tag) : undefined}>
        <FieldRow label={t('common.username')} htmlFor="u-name">
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
        <FieldRow label={t('users.displayName')} htmlFor="u-display">
          <TextInput id="u-display" value={draft.displayName} maxLength={80} placeholder={t('common.optional')} onChange={(e) => set('displayName', e.target.value)} />
        </FieldRow>
        <FieldRow label={isNew ? t('common.password') : t('users.newPassword')} htmlFor="u-pw">
          <TextInput
            id="u-pw"
            type="password"
            autoComplete="new-password"
            value={draft.password}
            maxLength={200}
            placeholder={isNew ? t('users.passwordMin') : t('users.passwordKeep')}
            onChange={(e) => set('password', e.target.value)}
          />
        </FieldRow>
      </Group>

      <Group footer={isSelf ? t('users.selfHint') : t('users.sessionHint')}>
        <SwitchRow title="Admin" subtitle={t('users.adminHint')} checked={draft.isAdmin} onChange={(v) => set('isAdmin', v)} disabled={isSelf} />
        <SwitchRow title={t('users.disabled')} subtitle={t('users.disabledHint')} checked={draft.disabled} onChange={(v) => set('disabled', v)} disabled={isSelf} />
      </Group>

      {!draft.isAdmin && (
        <Group title={t('users.assignedPages')} aside={t('admin.selected', { count: draft.pageIds.length })}>
          {pages.length === 0 && <p className="px-3.5 py-3 text-sm text-noc-muted">{t('users.createPageFirst')}</p>}
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
          label={t('users.delete')}
          confirming={confirmDelete}
          onAsk={() => setConfirmDelete(true)}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void onDelete()}
          disabled={isSelf}
          hint={isSelf ? t('users.cannotDeleteSelf') : undefined}
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
  const { t, tag } = useI18n();
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
        title={t('admin.nav.users')}
        lead={t('users.lead')}
        action={
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> {t('users.user')}
          </PrimaryButton>
        }
      />

      {sharedError && <Banner tone="warn">{sharedError}</Banner>}
      <Group footer={t('users.sharedFooter')}>
        <SwitchRow
          title={t('users.shared')}
          subtitle={t('users.sharedHint')}
          checked={sharedAccess}
          onChange={(v) => void toggleShared(v)}
        />
      </Group>

      <Group title={t('users.accounts')}>
        {loading && !users.length && <LoadingRow />}
        {!loading && !users.length && (
          <EmptyRow action={<LinkButton onClick={() => setEditing('new')}>{t('users.createFirst')}</LinkButton>}>{t('users.empty')}</EmptyRow>
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
                  {u.id === currentUserId && <span className="ml-1.5 text-[12px] font-normal text-noc-muted">{t('users.you')}</span>}
                </>
              }
              subtitle={u.displayName ? `@${u.username}` : fmtLogin(u.lastLoginAt, t, tag)}
              onClick={() => setEditing(u.id)}
              detail={
                u.disabled ? (
                  <Pill tone="danger">{t('users.disabledPill')}</Pill>
                ) : u.isAdmin ? (
                  <Pill tone="info">Admin</Pill>
                ) : (
                  <span className="max-w-[16rem] truncate">{pageNames || t('users.noPage')}</span>
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

