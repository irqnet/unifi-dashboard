'use client';

import clsx from 'clsx';
import { Activity, ArrowDown, ArrowUp, LayoutGrid, LogIn, Server, Cpu, Gauge, Globe, LogOut, MemoryStick, Pause, RefreshCw, Settings2, Ticket, Timer } from 'lucide-react';
import Link from 'next/link';
import { REFRESH_OPTIONS } from '@/lib/constants';
import { formatBps, formatMbps, formatTime } from '@/lib/format';
import type { DashboardPayload } from '@/lib/views';
import { Meter, StatusBadge } from '../ui/primitives';


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
}: {
  data: DashboardPayload | null;
  site: string;
  onSite: (s: string) => void;
  refreshMs: number;
  onRefresh: (ms: number) => void;
  loading: boolean;
  onReload: () => void;
  onLogout: () => void;
  view: 'network' | 'hardware' | 'status';
}) {
  const sp = data?.statusPage;
  const isStatus = view === 'status';
  const showWan = !isStatus || !!sp?.showWan;
  const tabs = isStatus ? [] : [
    { key: 'network', href: '/', label: 'Netzwerke', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
    { key: 'hardware', href: '/hardware', label: 'Hardware', icon: <Server className="h-3.5 w-3.5" /> },
    // Gäste-WLAN-Voucher nur für Admins sichtbar
    ...(data?.isAdmin ? [{ key: 'vouchers', href: '/vouchers', label: 'Voucher', icon: <Ticket className="h-3.5 w-3.5" /> }] : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-noc-line bg-noc-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10">
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-noc-text">{isStatus ? sp?.title ?? 'Statusseite' : 'UniFi Network Status'}</div>
            {isStatus ? (
              sp && sp.pages.length > 1 ? (
                <select
                  aria-label="Statusseite"
                  value={sp.slug}
                  onChange={(e) => window.location.assign(`/s/${e.target.value}`)}
                  className="mt-0.5 !border-0 !bg-transparent !p-0 !pr-6 text-xs text-noc-muted !ring-0 hover:text-noc-text"
                >
                  {sp.pages.map((p) => (
                    <option key={p.slug} value={p.slug} className="bg-noc-panel">
                      {p.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-0.5 text-xs text-noc-muted">Statusseite</div>
              )
            ) : (
            <select
              aria-label="Standort"
              value={site}
              onChange={(e) => onSite(e.target.value)}
              className="mt-0.5 !border-0 !bg-transparent !p-0 !pr-6 text-xs text-noc-muted !ring-0 hover:text-noc-text"
            >
              {(data?.sites ?? [{ name: site, desc: site }]).map((s) => (
                <option key={s.name} value={s.name} className="bg-noc-panel">
                  {s.desc}
                </option>
              ))}
            </select>
            )}
          </div>
          {data && <StatusBadge status={data.status} />}
        </div>

        {tabs.length > 0 && (
        <nav className="flex overflow-hidden rounded-lg border border-noc-line" aria-label="Ansicht">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={view === t.key ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm transition',
                view === t.key ? 'bg-sky-500/20 text-sky-300' : 'text-noc-muted hover:bg-noc-raised hover:text-noc-text',
              )}
            >
              {t.icon}
              {t.label}
            </Link>
          ))}
        </nav>
        )}

        {data && showWan && (
          <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <HeaderStat icon={<Globe className="h-3.5 w-3.5" />} label="WAN-IP" value={data.wan.ip ?? '–'} sub={data.wan.isp ?? undefined} />
            <HeaderStat icon={<Timer className="h-3.5 w-3.5" />} label="Latenz" value={data.wan.latency !== null ? `${data.wan.latency} ms` : '–'} />
            <HeaderStat
              icon={<Gauge className="h-3.5 w-3.5" />}
              label="ISP-Speedtest"
              value={
                <span>
                  ↓ {formatMbps(data.wan.xputDown)} <span className="text-noc-muted">/</span> ↑ {formatMbps(data.wan.xputUp)}
                </span>
              }
            />
            <HeaderStat
              icon={<ArrowDown className="h-3.5 w-3.5" />}
              label="WAN live"
              value={
                <span>
                  <span className="text-sky-300">↓ {formatBps(data.wan.down)}</span>{' '}
                  <span className="text-violet-300">
                    <ArrowUp className="inline h-3 w-3" /> {formatBps(data.wan.up)}
                  </span>
                </span>
              }
            />
            <div className="flex items-center gap-4">
              <LoadStat icon={<Cpu className="h-3.5 w-3.5" />} label="GW CPU" value={data.gateway.cpu} />
              <LoadStat icon={<MemoryStick className="h-3.5 w-3.5" />} label="GW RAM" value={data.gateway.mem} />
            </div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden text-right text-[11px] leading-tight text-noc-muted sm:block">
            <div>Letzter Poll</div>
            <div className="font-mono text-noc-text">{formatTime(data?.lastPoll)}</div>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-noc-line" role="group" aria-label="Auto-Refresh">
            {REFRESH_OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => onRefresh(o.ms)}
                className={clsx(
                  'px-2.5 py-1.5 text-xs transition',
                  refreshMs === o.ms ? 'bg-sky-500/20 text-sky-300' : 'text-noc-muted hover:bg-noc-raised hover:text-noc-text',
                )}
                aria-pressed={refreshMs === o.ms}
              >
                {o.ms === 0 ? <Pause className="h-3.5 w-3.5" /> : o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onReload} className="rounded-lg border border-noc-line p-1.5 text-noc-muted hover:text-noc-text" aria-label="Jetzt aktualisieren">
            <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
          </button>
          {!isStatus && (
            <Link
              href="/admin"
              className="rounded-lg border border-noc-line p-1.5 text-noc-muted hover:text-noc-text"
              aria-label="Admin-Bereich"
              title="Admin-Bereich"
            >
              <Settings2 className="h-4 w-4" />
            </Link>
          )}
          {isStatus && sp && !sp.loggedIn ? (
            <Link href="/gate" className="rounded-lg border border-noc-line p-1.5 text-noc-muted hover:text-noc-text" aria-label="Anmelden" title="Anmelden">
              <LogIn className="h-4 w-4" />
            </Link>
          ) : (
            <button type="button" onClick={onLogout} className="rounded-lg border border-noc-line p-1.5 text-noc-muted hover:text-rose-300" aria-label="Abmelden" title="Abmelden">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function HeaderStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-noc-muted">
        {icon}
        {label}
      </div>
      <div className="font-mono tabular-nums text-noc-text">
        {value}
        {sub && <span className="ml-1.5 font-sans text-noc-muted">{sub}</span>}
      </div>
    </div>
  );
}

function LoadStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | null }) {
  return (
    <div className="w-20">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-noc-muted">
        <span className="flex items-center gap-1">
          {icon}
          {label}
        </span>
      </div>
      <div className="font-mono tabular-nums text-noc-text">{value !== null ? `${value.toFixed(0)}%` : '–'}</div>
      <Meter value={value} className="mt-0.5" />
    </div>
  );
}
