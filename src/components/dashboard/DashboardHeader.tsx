'use client';

import clsx from 'clsx';
import { Activity, LayoutGrid, LogIn, LogOut, MoreHorizontal, Pause, PencilRuler, RefreshCw, Server, Settings2, Ticket, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LanguageSwitcher, useI18n, useT } from '@/components/i18n/I18nProvider';
import { REFRESH_OPTIONS } from '@/lib/constants';
import { formatTime } from '@/lib/format';
import type { DashboardPayload } from '@/lib/views';
import { StatusBadge } from '../ui/primitives';
import { ThemeSwitcher } from '../ui/theme';

type View = 'network' | 'hardware' | 'status';

function useTabs(view: View, isAdmin: boolean) {
  const t = useT();
  if (view === 'status') return [];
  return [
    { key: 'network', href: '/', label: t('nav.networks'), icon: LayoutGrid },
    { key: 'hardware', href: '/hardware', label: t('nav.hardware'), icon: Server },
    // Guest Wi-Fi vouchers are only visible to admins
    ...(isAdmin ? [{ key: 'vouchers', href: '/admin?section=vouchers', label: t('nav.vouchers'), icon: Ticket }] : []),
  ];
}

function RefreshPicker({ refreshMs, onRefresh, className }: { refreshMs: number; onRefresh: (ms: number) => void; className?: string }) {
  const t = useT();
  return (
    <div className={clsx('inline-flex rounded-lg border border-noc-line bg-noc-raised p-0.5', className)} role="group" aria-label="Auto-Refresh">
      {REFRESH_OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onRefresh(o.ms)}
          className={clsx(
            'flex flex-1 items-center justify-center rounded-md px-2 py-1 text-xs transition-colors',
            refreshMs === o.ms ? 'bg-noc-panel text-noc-text shadow-sm ring-1 ring-inset ring-noc-line' : 'text-noc-muted hover:text-noc-text',
          )}
          aria-pressed={refreshMs === o.ms}
          title={o.ms === 0 ? t('header.pause') : t('header.every', { interval: o.label })}
        >
          {o.ms === 0 ? <Pause className="h-3.5 w-3.5" /> : o.label}
        </button>
      ))}
    </div>
  );
}

const iconBtn = 'flex h-8 w-8 items-center justify-center rounded-lg border border-noc-line bg-noc-panel text-noc-muted transition-colors hover:text-noc-text';

export function DashboardHeader({
  data,
  site,
  onSite,
  refreshMs,
  onRefresh,
  loading,
  onReload,
  onLogout,
  view,
  editing,
  onEdit,
}: {
  data: DashboardPayload | null;
  site: string;
  onSite: (s: string) => void;
  refreshMs: number;
  onRefresh: (ms: number) => void;
  loading: boolean;
  onReload: () => void;
  onLogout: () => void;
  view: View;
  editing: boolean;
  onEdit: () => void;
}) {
  const { t, tag } = useI18n();
  const sp = data?.statusPage;
  const isStatus = view === 'status';
  const tabs = useTabs(view, !!data?.isAdmin);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const loginOrLogout =
    isStatus && sp && !sp.loggedIn ? (
      <Link href="/gate" className={iconBtn} aria-label={t('common.signIn')} title={t('common.signIn')}>
        <LogIn className="h-4 w-4" />
      </Link>
    ) : (
      <button type="button" onClick={onLogout} className={clsx(iconBtn, 'hover:!text-rose-300')} aria-label={t('common.signOut')} title={t('common.signOut')}>
        <LogOut className="h-4 w-4" />
      </button>
    );

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-noc-line bg-noc-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] items-center gap-3 px-3 py-2.5 sm:gap-5 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/25">
              <Activity className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight text-noc-text">
                {isStatus ? sp?.title ?? t('header.statusPage') : <><span className="sm:hidden">UniFi Status</span><span className="hidden sm:inline">UniFi Network Status</span></>}
              </div>
              {isStatus ? (
                sp && sp.pages.length > 1 ? (
                  <select
                    aria-label={t('header.statusPage')}
                    value={sp.slug}
                    onChange={(e) => window.location.assign(`/s/${e.target.value}`)}
                    className="mt-0.5 max-w-full !border-0 !bg-transparent !p-0 !pr-6 text-xs text-noc-muted !ring-0 hover:text-noc-text"
                  >
                    {sp.pages.map((p) => (
                      <option key={p.slug} value={p.slug} className="bg-noc-panel">
                        {p.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-0.5 text-xs text-noc-muted">{t('header.statusPage')}</div>
                )
              ) : (
                <select
                  aria-label={t('header.site')}
                  value={site}
                  onChange={(e) => onSite(e.target.value)}
                  className="mt-0.5 max-w-full !border-0 !bg-transparent !p-0 !pr-6 text-xs text-noc-muted !ring-0 hover:text-noc-text"
                >
                  {(data?.sites ?? [{ name: site, desc: site }]).map((s) => (
                    <option key={s.name} value={s.name} className="bg-noc-panel">
                      {s.desc}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {data && <StatusBadge status={data.status} size="sm" />}
          </div>

          {tabs.length > 0 && (
            <nav className="hidden rounded-lg border border-noc-line bg-noc-raised p-0.5 sm:flex" aria-label={t('header.view')}>
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={tab.href}
                  aria-current={view === tab.key ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors',
                    view === tab.key ? 'bg-noc-panel text-noc-text shadow-sm ring-1 ring-inset ring-noc-line' : 'text-noc-muted hover:text-noc-text',
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right text-[11px] leading-tight text-noc-muted xl:block">
              <div>{t('header.lastPoll')}</div>
              <div className="font-mono text-noc-text">{formatTime(data?.lastPoll, tag)}</div>
            </div>
            <RefreshPicker refreshMs={refreshMs} onRefresh={onRefresh} className="hidden lg:inline-flex" />
            <ThemeSwitcher className="hidden md:inline-flex" />
            <LanguageSwitcher className="hidden md:inline-flex" />
            {!editing && (
              <button type="button" onClick={onEdit} className={clsx(iconBtn, 'hidden w-auto gap-1.5 px-2.5 text-sm sm:flex')} title={t('header.arrangeTiles')}>
                <PencilRuler className="h-4 w-4" />
                <span className="hidden xl:inline">{t('header.arrange')}</span>
              </button>
            )}
            <button type="button" onClick={onReload} className={iconBtn} aria-label={t('header.refreshNow')} title={t('header.refreshNow')}>
              <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
            </button>
            {!isStatus && (
              <Link href="/admin" className={clsx(iconBtn, 'hidden lg:flex')} aria-label={t('header.admin')} title={t('header.admin')}>
                <Settings2 className="h-4 w-4" />
              </Link>
            )}
            <span className="hidden lg:contents">{loginOrLogout}</span>

            {/* Smaller screens: further settings in the menu */}
            <div ref={menuRef} className="relative lg:hidden">
              <button type="button" onClick={() => setMenu((m) => !m)} className={iconBtn} aria-label={t('header.menu')} aria-expanded={menu}>
                {menu ? <X className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
              </button>
              {menu && (
                <div className="absolute right-0 top-10 z-50 w-72 space-y-3 rounded-2xl bg-noc-panel p-3 shadow-2xl ring-1 ring-noc-line">
                  <div>
                    <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-noc-muted">{t('common.appearance')}</div>
                    <ThemeSwitcher labels className="flex w-full" />
                  </div>
                  <div>
                    <div className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-noc-muted">{t('common.language')}</div>
                    <LanguageSwitcher labels className="flex w-full" />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] font-medium uppercase tracking-wider text-noc-muted">
                      <span>{t('header.refresh')}</span>
                      <span className="font-mono normal-case tracking-normal">{formatTime(data?.lastPoll, tag)}</span>
                    </div>
                    <RefreshPicker refreshMs={refreshMs} onRefresh={onRefresh} className="flex w-full" />
                  </div>
                  <div className="divide-y divide-noc-line overflow-hidden rounded-xl bg-noc-raised text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        onEdit();
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-noc-text hover:bg-fg/5"
                    >
                      <PencilRuler className="h-4 w-4 text-noc-muted" /> {t('header.arrangeTiles')}
                    </button>
                    {!isStatus && (
                      <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2.5 text-noc-text hover:bg-fg/5">
                        <Settings2 className="h-4 w-4 text-noc-muted" /> {t('header.admin')}
                      </Link>
                    )}
                    {isStatus && sp && !sp.loggedIn ? (
                      <Link href="/gate" className="flex items-center gap-2.5 px-3 py-2.5 text-noc-text hover:bg-fg/5">
                        <LogIn className="h-4 w-4 text-noc-muted" /> {t('common.signIn')}
                      </Link>
                    ) : (
                      <button type="button" onClick={onLogout} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-rose-300 hover:bg-fg/5">
                        <LogOut className="h-4 w-4" /> {t('common.signOut')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Phone: tab bar at the bottom */}
      {tabs.length > 0 && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-noc-line bg-noc-panel/95 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-xl sm:hidden"
          aria-label={t('header.view')}
        >
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={view === tab.key ? 'page' : undefined}
              className={clsx('flex flex-1 flex-col items-center gap-0.5 py-1 text-[10.5px]', view === tab.key ? 'text-sky-400' : 'text-noc-muted')}
            >
              <tab.icon className="h-5 w-5" />
              {tab.label}
            </Link>
          ))}
          <button type="button" onClick={onEdit} className={clsx('flex flex-1 flex-col items-center gap-0.5 py-1 text-[10.5px]', editing ? 'text-sky-400' : 'text-noc-muted')}>
            <PencilRuler className="h-5 w-5" />
            {t('header.arrange')}
          </button>
        </nav>
      )}
    </>
  );
}
