'use client';

import clsx from 'clsx';
import { ChevronDown, ChevronLeft, Cog, Layers, LayoutGrid, LogOut, RefreshCw, Server, ShieldOff, Ticket, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { LanguageSwitcher, useI18n } from '@/components/i18n/I18nProvider';
import { LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n/config';
import type { MessageKey } from '@/lib/i18n/translate';
import type { SiteInfo } from '@/lib/views';
import { ThemeSwitcher } from '../ui/theme';
import { VoucherManager } from '../vouchers/VoucherManager';
import { StatusPagesSection, UsersSection } from './AccessAdmin';
import { DeviceGroups } from './DeviceGroups';
import { NetworksSection } from './NetworksSection';
import { Banner, Group, PageHeader, Row } from './ui';

async function api<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      window.location.assign('/admin/login');
      return { error: 'Session expired' };
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { data: json };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

type View = 'networks' | 'devices' | 'status-pages' | 'users' | 'vouchers' | 'general';
const VIEWS: View[] = ['networks', 'devices', 'status-pages', 'users', 'vouchers', 'general'];
/** Section names used in links before the switch to English (?bereich=…) */
const LEGACY_VIEWS: Record<string, View> = {
  netzwerke: 'networks',
  geraete: 'devices',
  statusseiten: 'status-pages',
  benutzer: 'users',
  voucher: 'vouchers',
  allgemein: 'general',
};

interface NavItem {
  view: View;
  label: MessageKey;
  icon: ReactNode;
  color: string;
}

const NAV: { title: MessageKey; items: NavItem[] }[] = [
  {
    title: 'admin.nav.display',
    items: [
      { view: 'networks', label: 'nav.networks', icon: <Layers />, color: '#0a84ff' },
      { view: 'devices', label: 'admin.nav.devices', icon: <Server />, color: '#5e5ce6' },
    ],
  },
  {
    title: 'admin.nav.access',
    items: [
      { view: 'status-pages', label: 'admin.nav.statusPages', icon: <LayoutGrid />, color: '#30b0c7' },
      { view: 'users', label: 'admin.nav.users', icon: <Users />, color: '#ff9f0a' },
    ],
  },
  { title: 'admin.nav.guests', items: [{ view: 'vouchers', label: 'nav.vouchers', icon: <Ticket />, color: '#30d158' }] },
  { title: 'admin.nav.system', items: [{ view: 'general', label: 'admin.nav.general', icon: <Cog />, color: '#8e8e93' }] },
];

function NavIcon({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-white [&>svg]:h-[13px] [&>svg]:w-[13px] [&>svg]:stroke-[2.4]" style={{ background: color }}>
      {children}
    </span>
  );
}

function readView(): View | null {
  const sp = new URLSearchParams(window.location.search);
  const v = sp.get('section');
  if (v && (VIEWS as string[]).includes(v)) return v as View;
  // Old German links: map and rewrite the address
  const legacy = LEGACY_VIEWS[sp.get('bereich') ?? ''];
  if (legacy) window.history.replaceState(null, '', `/admin?section=${legacy}`);
  return legacy ?? null;
}

export function AdminPanel() {
  const { t } = useI18n();
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [site, setSite] = useState('');
  /** null = the overview on phones, "Networks" on desktop */
  const [view, setView] = useState<View | null>(null);
  const [showUngrouped, setShowUngrouped] = useState(true);
  const [showUngroupedDevices, setShowUngroupedDevices] = useState(true);
  const [defaultLanguage, setDefaultLanguage] = useState<Locale>('en');
  const [reloadSignal, setReloadSignal] = useState(0);
  const [controllerError, setControllerError] = useState<string | null>(null);
  const [db, setDb] = useState<{ persistent: boolean; path: string; error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Partial<Record<View, number>>>({});
  const [countSignal, setCountSignal] = useState(0);

  // Read the view from the address and follow back/forward in the browser
  useEffect(() => {
    setView(readView());
    const onPop = () => setView(readView());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (v: View | null) => {
    setView(v);
    setError(null);
    const url = v ? `/admin?section=${v}` : '/admin';
    window.history.pushState(null, '', url);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    void (async () => {
      const [s, st] = await Promise.all([
        api<{ sites: SiteInfo[] }>('/api/unifi/sites'),
        api<{
          settings: { showUngrouped: boolean; showUngroupedDevices: boolean; defaultLanguage: Locale };
          db?: { persistent: boolean; path: string; error: string | null };
        }>('/api/admin/settings'),
      ]);
      if (s.data) {
        setSites(s.data.sites);
        let pref = '';
        try {
          pref = JSON.parse(window.localStorage.getItem('ud.site') ?? '""') as string;
        } catch {
          /* ignore */
        }
        setSite((cur) => cur || (s.data!.sites.some((x) => x.name === pref) ? pref : s.data!.sites[0]?.name) || 'default');
      }
      if (st.data) {
        setShowUngrouped(st.data.settings.showUngrouped);
        setShowUngroupedDevices(st.data.settings.showUngroupedDevices);
        setDefaultLanguage(st.data.settings.defaultLanguage);
        if (st.data.db) setDb(st.data.db);
      }
      if (s.error || st.error) setError(s.error ?? st.error ?? null);
    })();
  }, []);

  // Counters for the sidebar
  useEffect(() => {
    if (!site) return;
    void (async () => {
      const q = `?site=${encodeURIComponent(site)}`;
      const [g, d, p, u] = await Promise.all([
        api<{ groups: unknown[] }>(`/api/admin/groups${q}`),
        api<{ groups: unknown[] }>(`/api/admin/device-groups${q}`),
        api<{ pages: { site: string }[] }>('/api/admin/status-pages'),
        api<{ users: unknown[] }>('/api/admin/users'),
      ]);
      setCounts({
        networks: g.data?.groups.length,
        devices: d.data?.groups.length,
        'status-pages': p.data?.pages.filter((x) => x.site === site).length,
        users: u.data?.users.length,
      });
    })();
  }, [site, countSignal, reloadSignal]);

  const changeSite = (s: string) => {
    setSite(s);
    try {
      window.localStorage.setItem('ud.site', JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  const onChanged = useCallback(() => setCountSignal((n) => n + 1), []);
  const onError = useCallback((e: string | null) => setError(e), []);
  const onControllerError = useCallback((e: string | null) => setControllerError(e), []);

  const updateSetting = async (key: 'showUngrouped' | 'showUngroupedDevices', v: boolean) => {
    (key === 'showUngrouped' ? setShowUngrouped : setShowUngroupedDevices)(v);
    const res = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ [key]: v }) });
    if (res.error) {
      setError(res.error);
      (key === 'showUngrouped' ? setShowUngrouped : setShowUngroupedDevices)(!v);
    }
  };

  const updateDefaultLanguage = async (lang: Locale) => {
    const prev = defaultLanguage;
    setDefaultLanguage(lang);
    const res = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ defaultLanguage: lang }) });
    if (res.error) {
      setError(res.error);
      setDefaultLanguage(prev);
    }
  };

  const dropAdmin = async () => {
    await fetch('/api/auth/admin', { method: 'DELETE' }).catch(() => null);
    window.location.assign('/');
  };
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.assign('/gate');
  };

  const active: View = view ?? 'networks';
  const activeItem = NAV.flatMap((g) => g.items).find((i) => i.view === active)!;
  const siteDesc = sites.find((s) => s.name === site)?.desc ?? site;

  const siteSelect = (
    <label className="relative mx-1 block">
      <span className="sr-only">{t('header.site')}</span>
      <select
        value={site}
        onChange={(e) => changeSite(e.target.value)}
        className="w-full appearance-none !rounded-lg !border-fg/[0.07] !bg-noc-group !py-1.5 !pl-3 !pr-8 text-[13px]"
        disabled={sites.length < 2}
      >
        {(sites.length ? sites : [{ name: site, desc: siteDesc || '…' }]).map((s) => (
          <option key={s.name} value={s.name}>
            {s.desc}
          </option>
        ))}
      </select>
      {sites.length > 1 && <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-noc-muted" />}
    </label>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      {/* ---------------- Sidebar ---------------- */}
      <aside
        className={clsx(
          'flex-col gap-4 bg-noc-sidebar px-3 pb-4 pt-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto lg:border-r lg:border-fg/[0.06] lg:px-2.5',
          view === null ? 'flex min-h-screen' : 'hidden',
        )}
        aria-label={t('admin.navLabel')}
      >
        <div className="flex items-center gap-2.5 px-2 py-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-indigo-400 text-white">
            <Cog className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-noc-strong">{t('admin.title')}</div>
            <div className="text-[11.5px] text-noc-muted">UniFi Dashboard</div>
          </div>
        </div>

        {siteSelect}

        <nav className="flex flex-col gap-3.5">
          {NAV.map((grp) => (
            <div key={grp.title}>
              <div className="px-2.5 pb-1 text-[11px] font-semibold text-noc-muted">{t(grp.title)}</div>
              <ul className="flex flex-col gap-px max-lg:gap-0 max-lg:divide-y max-lg:divide-fg/[0.06] max-lg:overflow-hidden max-lg:rounded-xl max-lg:bg-noc-group">
                {grp.items.map((it) => (
                  <li key={it.view}>
                    <button
                      type="button"
                      onClick={() => go(it.view)}
                      aria-current={active === it.view && view !== null ? 'page' : undefined}
                      className={clsx(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 max-lg:min-h-[46px] max-lg:rounded-none max-lg:text-[15px]',
                        active === it.view ? 'lg:bg-sky-400/[0.16] lg:text-noc-strong' : 'text-noc-soft lg:hover:bg-fg/[0.04]',
                      )}
                    >
                      <NavIcon color={it.color}>{it.icon}</NavIcon>
                      <span className="flex-1">{t(it.label)}</span>
                      {counts[it.view] !== undefined && <span className="text-[12px] tabular-nums text-noc-muted">{counts[it.view]}</span>}
                      <ChevronLeft className="h-4 w-4 rotate-180 text-noc-faint lg:hidden" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-px border-t border-fg/[0.06] pt-3">
          <div className="px-1.5 pb-2">
            <div className="px-1 pb-1.5 text-[11px] font-semibold text-noc-muted">{t('common.appearance')}</div>
            <ThemeSwitcher labels className="flex w-full" />
            <div className="px-1 pb-1.5 pt-3 text-[11px] font-semibold text-noc-muted">{t('common.language')}</div>
            <LanguageSwitcher labels className="flex w-full" />
          </div>
          <Link href="/" className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] text-noc-soft hover:bg-fg/[0.04]">
            <ChevronLeft className="h-4 w-4" /> {t('admin.toDashboard')}
          </Link>
          <button type="button" onClick={() => void dropAdmin()} className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13.5px] text-noc-muted hover:bg-fg/[0.04] hover:text-noc-text">
            <ShieldOff className="h-4 w-4" /> {t('admin.dropAdmin')}
          </button>
        </div>
      </aside>

      {/* ---------------- Content ---------------- */}
      <div className={clsx('min-w-0', view === null && 'hidden lg:block')}>
        {/* Mobile header with back button */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-fg/[0.06] bg-noc-bg/85 px-3 py-2.5 backdrop-blur lg:hidden">
          <button type="button" onClick={() => go(null)} className="flex items-center gap-0.5 text-[15px] text-sky-400">
            <ChevronLeft className="h-5 w-5" /> {t('admin.title')}
          </button>
          <span className="truncate text-[13px] text-noc-muted">{siteDesc}</span>
        </div>

        <main className={clsx('mx-auto px-4 pb-16 pt-6 sm:px-8 lg:pt-9', active === 'vouchers' ? 'max-w-[1400px]' : 'max-w-[900px]')}>
          {db && !db.persistent && (
            <Banner tone="danger">
              {t('admin.dbNotWritable', { path: db.path, error: db.error ?? '' })}
            </Banner>
          )}
          {controllerError && active !== 'general' && <Banner tone="warn">{t('admin.controllerUnreachable', { error: controllerError })}</Banner>}
          {error && (
            <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl bg-amber-400/[0.08] px-3.5 py-2.5 text-[13px] text-amber-200 ring-1 ring-inset ring-amber-400/20">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label={t('admin.dismiss')} className="text-amber-200/70 hover:text-amber-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {!site ? null : active === 'networks' ? (
            <NetworksSection
              site={site}
              api={api}
              reloadSignal={reloadSignal}
              showUngrouped={showUngrouped}
              onShowUngrouped={(v) => void updateSetting('showUngrouped', v)}
              onError={onError}
              onControllerError={onControllerError}
              onChanged={onChanged}
            />
          ) : active === 'devices' ? (
            <DeviceGroups
              site={site}
              api={api}
              reloadSignal={reloadSignal}
              showUngrouped={showUngroupedDevices}
              onShowUngrouped={(v) => void updateSetting('showUngroupedDevices', v)}
              onError={onError}
              onChanged={onChanged}
            />
          ) : active === 'status-pages' ? (
            <StatusPagesSection site={site} api={api} reloadSignal={reloadSignal} onError={onError} onChanged={onChanged} />
          ) : active === 'users' ? (
            <UsersSection sites={sites} api={api} reloadSignal={reloadSignal} onError={onError} onChanged={onChanged} />
          ) : active === 'vouchers' ? (
            <VoucherManager site={site} />
          ) : (
            <>
              <PageHeader title={t('admin.nav.general')} lead={t('admin.general.lead')} />
              <Group title={t('admin.nav.system')}>
                <Row
                  title="UniFi Controller"
                  subtitle={controllerError ?? t('admin.general.site', { site: siteDesc })}
                  detail={
                    <span className={clsx('flex items-center gap-1.5', controllerError ? 'text-amber-300' : 'text-emerald-300')}>
                      <span className={clsx('h-2 w-2 rounded-full', controllerError ? 'bg-amber-400' : 'bg-emerald-400')} />
                      {controllerError ? t('admin.general.disrupted') : t('admin.general.connected')}
                    </span>
                  }
                />
                <Row
                  title={t('admin.general.database')}
                  subtitle={db?.path ?? '…'}
                  detail={
                    db && (
                      <span className={clsx('flex items-center gap-1.5', db.persistent ? 'text-emerald-300' : 'text-rose-300')}>
                        <span className={clsx('h-2 w-2 rounded-full', db.persistent ? 'bg-emerald-400' : 'bg-rose-400')} />
                        {db.persistent ? t('admin.general.persistent') : t('admin.general.inMemory')}
                      </span>
                    )
                  }
                />
                <Row
                  title={t('admin.general.reload')}
                  subtitle={t('admin.general.reloadHint')}
                  onClick={() => setReloadSignal((n) => n + 1)}
                  chevron={false}
                  detail={<RefreshCw className="h-4 w-4 text-sky-400" />}
                />
              </Group>
              <Group title={t('common.language')} footer={t('admin.general.languageHint')}>
                <Row title={t('admin.general.yourLanguage')} detail={<LanguageSwitcher labels />} chevron={false} />
                <Row
                  title={t('admin.general.defaultLanguage')}
                  chevron={false}
                  detail={
                    <select
                      value={defaultLanguage}
                      onChange={(e) => void updateDefaultLanguage(e.target.value as Locale)}
                      aria-label={t('admin.general.defaultLanguage')}
                      className="!py-1 text-[13px]"
                    >
                      {LOCALES.map((l) => (
                        <option key={l} value={l}>
                          {LOCALE_NAMES[l]}
                        </option>
                      ))}
                    </select>
                  }
                />
              </Group>
              <Group title={t('admin.general.session')} footer={t('admin.general.sessionHint')}>
                <Row title={t('admin.dropAdmin')} onClick={() => void dropAdmin()} chevron={false} detail={<ShieldOff className="h-4 w-4" />} />
                <Row title={t('common.signOut')} onClick={() => void logout()} chevron={false} detail={<LogOut className="h-4 w-4" />} />
              </Group>
            </>
          )}
          <span className="sr-only" aria-live="polite">
            {t(activeItem.label)}
          </span>
        </main>
      </div>
    </div>
  );
}
