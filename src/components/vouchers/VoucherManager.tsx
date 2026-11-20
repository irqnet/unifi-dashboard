'use client';

import clsx from 'clsx';
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n, useT } from '@/components/i18n/I18nProvider';
import type { MessageKey, TFunction } from '@/lib/i18n/translate';
import { describeSpec, formatDuration, formatKbps, formatMegabytes } from '@/lib/voucherFormat';
import type { VoucherListPayload, VoucherState, VoucherView } from '@/lib/vouchers';
import { Button } from '../ui/primitives';

/** Cards and headings in the style of the admin area */
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('rounded-xl bg-noc-group ring-1 ring-inset ring-fg/[0.04]', className)}>{children}</div>;
}

function SectionTitle({ icon, children, right }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-noc-strong">
        {icon}
        {children}
      </h2>
      {right}
    </div>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      window.location.reload();
      return { error: 'Session expired' };
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: json.error ?? `HTTP ${res.status}` };
    return { data: json };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// --- Formatting -----------------------------------------------------------------

function fmtKbps(k: number | null): string {
  return k ? formatKbps(k) : '∞';
}

function fmtMb(mb: number | null): string {
  return mb ? formatMegabytes(mb) : '';
}

function fmtDate(ts: number | null, tag: string): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleString(tag, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtUsage(quota: number, t: TFunction): string {
  return quota === 0 ? t('voucher.spec.unlimited') : quota === 1 ? t('voucher.spec.singleUse') : t('voucher.spec.devices', { count: quota });
}

function fmtQuota(v: Pick<VoucherView, 'quota' | 'used'>): string {
  if (v.quota === 0) return `${v.used} / ∞`;
  return `${v.used} / ${v.quota}`;
}

const STATE: Record<VoucherState, { label: MessageKey; cls: string }> = {
  unused: { label: 'vouchers.state.unused', cls: 'text-sky-300 bg-sky-500/10 ring-sky-500/30' },
  active: { label: 'wan.role.active', cls: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30' },
  expired: { label: 'vouchers.state.expired', cls: 'text-slate-400 bg-slate-500/10 ring-slate-500/30' },
};

function StateBadge({ state }: { state: VoucherState }) {
  const t = useT();
  const s = STATE[state];
  return <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', s.cls)}>{t(s.label)}</span>;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* Clipboard not available (e.g. without HTTPS) */
    }
  }, []);
  return { copied, copy };
}

function printUrl(site: string, ids: string[], layout: 'a4' | 'bon' = 'a4') {
  const p = new URLSearchParams({ site, ids: ids.join(','), layout });
  return `/vouchers/print?${p.toString()}`;
}

// --- Component ----------------------------------------------------------------

type Filter = 'all' | VoucherState;

/** Voucher management, embedded in the admin area (the site comes from the sidebar). */
export function VoucherManager({ site }: { site: string }) {
  const { t, tag } = useI18n();
  const [data, setData] = useState<VoucherListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<VoucherView[] | null>(null);
  const { copied, copy } = useCopy();

  useEffect(() => {
    setCreated(null);
    setSelected(new Set());
  }, [site]);

  const load = useCallback(async () => {
    if (!site) return;
    setLoading(true);
    const r = await api<VoucherListPayload>(`/api/admin/vouchers?site=${encodeURIComponent(site)}`);
    if (r.data) {
      setData(r.data);
      setError(null);
      setSelected((sel) => new Set(Array.from(sel).filter((id) => r.data!.vouchers.some((v) => v.id === id))));
    } else setError(r.error ?? 'Error');
    setLoading(false);
  }, [site]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, unused: 0, active: 0, expired: 0 };
    for (const v of data?.vouchers ?? []) {
      c.all++;
      c[v.state]++;
    }
    return c;
  }, [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/-/g, '');
    return (data?.vouchers ?? []).filter(
      (v) =>
        (filter === 'all' || v.state === filter) &&
        (!q || v.code.replace(/-/g, '').includes(q) || v.note.toLowerCase().includes(q) || v.guests.some((g) => (g.name ?? '').toLowerCase().includes(q))),
    );
  }, [data, filter, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((v) => selected.has(v.id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visible.forEach((v) => n.delete(v.id));
      else visible.forEach((v) => n.add(v.id));
      return n;
    });
  }

  async function revoke(ids: string[]) {
    setBusy(true);
    const r = await api<{ deleted: number; errors: string[] }>('/api/admin/vouchers/delete', {
      method: 'POST',
      body: JSON.stringify({ site, ids }),
    });
    setBusy(false);
    setConfirm(null);
    if (r.error) setError(r.error);
    else if (r.data?.errors.length) setError(t('vouchers.revokePartial', { count: r.data.deleted, errors: r.data.errors.join(' · ') }));
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => n.delete(id));
      return n;
    });
    setCreated((c) => (c ? c.filter((v) => !ids.includes(v.id)) : c));
    await load();
  }

  const expiredIds = (data?.vouchers ?? []).filter((v) => v.state === 'expired').map((v) => v.id);
  const selectedIds = Array.from(selected);

  const grid = (
    <>
        <div className="space-y-6">
          {data && <CreateForm data={data} site={site} onCreated={(c) => { setCreated(c); void load(); }} />}
          {created && created.length > 0 && (
            <Panel className="border-emerald-500/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <Check className="h-4 w-4" /> {t('vouchers.created', { count: created.length })}
                </h3>
                <button type="button" onClick={() => setCreated(null)} className="text-noc-muted hover:text-noc-text" aria-label={t('common.close')}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {created.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => void copy(v.id, v.code)}
                    className="flex w-full items-center justify-between rounded-lg bg-noc-raised px-3 py-2 text-left hover:bg-noc-line"
                    title={t('vouchers.copyCode')}
                  >
                    <span className={clsx('font-mono tracking-wider text-noc-text', created.length === 1 ? 'text-2xl' : 'text-base')}>{v.code}</span>
                    {copied === v.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-noc-muted" />}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={printUrl(site, created.map((v) => v.id))} target="_blank" rel="noreferrer">
                  <Button variant="primary">
                    <Printer className="h-4 w-4" /> {t('vouchers.printA4')}
                  </Button>
                </a>
                <a href={printUrl(site, created.map((v) => v.id), 'bon')} target="_blank" rel="noreferrer">
                  <Button>
                    <Printer className="h-4 w-4" /> {t('print.layoutReceipt')}
                  </Button>
                </a>
                {created.length > 1 && (
                  <Button onClick={() => void copy('all', created.map((v) => v.code).join('\n'))}>
                    {copied === 'all' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {t('vouchers.copyAll')}
                  </Button>
                )}
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {data?.guestError && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {t('vouchers.guestError', { error: data.guestError })}
            </div>
          )}

          <Panel className="p-4">
            <SectionTitle
              icon={<Ticket className="h-4 w-4" />}
              right={
                <div className="flex flex-wrap items-center gap-2">
                  {selectedIds.length > 0 && (
                    <>
                      <span className="text-xs text-noc-muted">{t('admin.selected', { count: selectedIds.length })}</span>
                      <a href={printUrl(site, selectedIds)} target="_blank" rel="noreferrer">
                        <Button>
                          <Printer className="h-4 w-4" /> {t('print.print')}
                        </Button>
                      </a>
                      <Button variant="danger" onClick={() => setConfirm({ ids: selectedIds, label: t('vouchers.selectedLabel', { count: selectedIds.length }) })}>
                        <Trash2 className="h-4 w-4" /> {t('vouchers.revoke')}
                      </Button>
                    </>
                  )}
                  {expiredIds.length > 0 && selectedIds.length === 0 && (
                    <Button variant="ghost" onClick={() => setConfirm({ ids: expiredIds, label: t('vouchers.expiredLabel', { count: expiredIds.length }) })}>
                      <Trash2 className="h-4 w-4" /> {t('vouchers.removeExpired')}
                    </Button>
                  )}
                </div>
              }
            >
              {t('nav.vouchers')}
            </SectionTitle>

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-lg border border-noc-line text-sm">
                {(['all', 'unused', 'active', 'expired'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={clsx('px-3 py-1.5 transition', filter === f ? 'bg-sky-500/20 text-sky-300' : 'text-noc-muted hover:bg-noc-raised hover:text-noc-text')}
                  >
                    {f === 'all' ? t('vouchers.all') : t(STATE[f].label)} <span className="ml-1 text-xs opacity-70">{counts[f]}</span>
                  </button>
                ))}
              </div>
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-noc-muted" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('vouchers.search')} className="w-full !pl-8" />
              </div>
            </div>

            {confirm && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                <span className="flex-1">{t('vouchers.revokeConfirm', { label: confirm.label })}</span>
                <Button variant="danger" disabled={busy} onClick={() => void revoke(confirm.ids)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} {t('vouchers.revoke')}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}

            {!data && loading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-noc-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('vouchers.loading')}
              </div>
            ) : visible.length === 0 ? (
              <div className="py-10 text-center text-sm text-noc-muted">{data?.vouchers.length ? t('vouchers.noneForFilter') : t('vouchers.none')}</div>
            ) : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-noc-line text-left text-[11px] text-noc-muted">
                      <th className="w-10 px-4 py-2">
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label={t('vouchers.selectAll')} />
                      </th>
                      <th className="px-2 py-2">Code</th>
                      <th className="px-2 py-2">{t('port.status')}</th>
                      <th className="px-2 py-2">{t('vouchers.validity')}</th>
                      <th className="px-2 py-2">{t('vouchers.usage')}</th>
                      <th className="px-2 py-2">{t('vouchers.limits')}</th>
                      <th className="px-2 py-2">{t('vouchers.noteDevices')}</th>
                      <th className="px-2 py-2">{t('vouchers.createdAt')}</th>
                      <th className="px-2 py-2">{t('vouchers.expires')}</th>
                      <th className="px-4 py-2 text-right">{t('vouchers.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((v) => (
                      <tr key={v.id} className={clsx('border-b border-noc-line/60 align-top hover:bg-noc-raised/50', v.state === 'expired' && 'opacity-60')}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} aria-label={t('vouchers.selectOne', { code: v.code })} />
                        </td>
                        <td className="px-2 py-2.5">
                          <button type="button" onClick={() => void copy(v.id, v.code)} className="group flex items-center gap-1.5 whitespace-nowrap font-mono tracking-wider text-noc-text" title={t('vouchers.copy')}>
                            {v.code}
                            {copied === v.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-noc-muted opacity-0 group-hover:opacity-100" />}
                          </button>
                        </td>
                        <td className="px-2 py-2.5">
                          <StateBadge state={v.state} />
                        </td>
                        <td className="px-2 py-2.5 tabular-nums">{formatDuration(v.minutes, t)}</td>
                        <td className="px-2 py-2.5 font-mono tabular-nums" title={fmtUsage(v.quota, t)}>
                          {fmtQuota(v)}
                        </td>
                        <td className="px-2 py-2.5 text-xs text-noc-muted">
                          {v.up || v.down || v.megabytes ? (
                            <>
                              {(v.up || v.down) && (
                                <div className="whitespace-nowrap">
                                  ↓ {fmtKbps(v.down)} · ↑ {fmtKbps(v.up)}
                                </div>
                              )}
                              {v.megabytes && <div>{fmtMb(v.megabytes)}</div>}
                            </>
                          ) : (
                            '–'
                          )}
                        </td>
                        <td className="max-w-[260px] px-2 py-2.5">
                          <div className="truncate text-noc-text" title={v.note}>
                            {v.note || <span className="text-noc-muted">–</span>}
                          </div>
                          {v.guests.length > 0 && (
                            <div className="truncate text-xs text-noc-muted" title={v.guests.map((g) => g.name ?? g.mac).join(', ')}>
                              {v.guests.map((g) => g.name ?? g.mac).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-xs tabular-nums text-noc-muted">{fmtDate(v.createdAt, tag)}</td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-xs tabular-nums text-noc-muted">{v.expiresAt ? fmtDate(v.expiresAt, tag) : v.state === 'unused' ? t('vouchers.fromFirstUse') : '–'}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <a href={printUrl(site, [v.id])} target="_blank" rel="noreferrer" className="inline-flex rounded-md p-1.5 text-noc-muted hover:bg-noc-raised hover:text-noc-text" title={t('print.print')}>
                            <Printer className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setConfirm({ ids: [v.id], label: `Voucher ${v.code}` })}
                            className="inline-flex rounded-md p-1.5 text-noc-muted hover:bg-rose-500/10 hover:text-rose-300"
                            title={t('vouchers.revoke')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
    </>
  );

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-noc-strong">{t('nav.vouchers')}</h1>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-noc-muted">
            {t('vouchers.lead')}
            {data?.wifi.ssid && (
              <>
                {' '}
                {t('vouchers.network')}: <span className="font-mono text-noc-text">{data.wifi.ssid}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.mock && <span className="rounded-full bg-amber-400/[0.12] px-2 py-px text-[11.5px] font-medium text-amber-300">{t('vouchers.demo')}</span>}
          <button type="button" onClick={() => void load()} className="rounded-lg p-1.5 text-noc-muted hover:bg-fg/[0.06] hover:text-noc-text" aria-label={t('header.refreshNow')} title={t('header.refreshNow')}>
            <RefreshCw className={clsx('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>
      <div className="grid gap-6 2xl:grid-cols-[minmax(300px,380px)_1fr]">{grid}</div>
    </>
  );
}

// --- Create ---------------------------------------------------------------------

type Unit = 'min' | 'h' | 'd';
const UNIT_MIN: Record<Unit, number> = { min: 1, h: 60, d: 1440 };

function CreateForm({ data, site, onCreated }: { data: VoucherListPayload; site: string; onCreated: (v: VoucherView[]) => void }) {
  const t = useT();
  const [presetId, setPresetId] = useState<string>(data.presets[0]?.id ?? 'custom');
  const [duration, setDuration] = useState('1');
  const [unit, setUnit] = useState<Unit>('d');
  const [usage, setUsage] = useState<'single' | 'multi' | 'n'>('single');
  const [quota, setQuota] = useState('3');
  const [down, setDown] = useState('');
  const [up, setUp] = useState('');
  const [dataLimit, setDataLimit] = useState('');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { site, count: Number(count), note };
    if (presetId !== 'custom') body.presetId = presetId;
    else {
      body.minutes = Math.round(Number(duration) * UNIT_MIN[unit]);
      body.quota = usage === 'single' ? 1 : usage === 'multi' ? 0 : Number(quota);
      body.down = down ? Math.round(Number(down.replace(',', '.')) * 1000) : null;
      body.up = up ? Math.round(Number(up.replace(',', '.')) * 1000) : null;
      body.megabytes = dataLimit ? Math.round(Number(dataLimit.replace(',', '.')) * 1024) : null;
    }
    const r = await api<{ created: VoucherView[] }>('/api/admin/vouchers', { method: 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setNote('');
    onCreated(r.data?.created ?? []);
  }

  return (
    <Panel className="p-4">
      <SectionTitle icon={<Ticket className="h-4 w-4" />}>{t('vouchers.new')}</SectionTitle>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          {data.presets.map((p) => {
            const detail = describeSpec(p, t);
            // Unnamed presets already use the generated description as their title
            return (
              <PresetOption key={p.id} active={presetId === p.id} onClick={() => setPresetId(p.id)} title={p.label}>
                {detail !== p.label ? detail : null}
              </PresetOption>
            );
          })}
          <PresetOption active={presetId === 'custom'} onClick={() => setPresetId('custom')} title={t('vouchers.custom')}>
            {t('vouchers.customHint')}
          </PresetOption>
        </div>

        {presetId === 'custom' && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-noc-line p-3">
            <Field label={t('vouchers.validity')} className="col-span-2">
              <div className="flex gap-2">
                <input type="number" min={1} required value={duration} onChange={(e) => setDuration(e.target.value)} className="w-24" />
                <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="flex-1">
                  <option value="min">{t('vouchers.unit.minutes')}</option>
                  <option value="h">{t('vouchers.unit.hours')}</option>
                  <option value="d">{t('vouchers.unit.days')}</option>
                </select>
              </div>
            </Field>
            <Field label={t('vouchers.usage')} className="col-span-2">
              <div className="flex gap-2">
                <select value={usage} onChange={(e) => setUsage(e.target.value as typeof usage)} className="flex-1">
                  <option value="single">{t('vouchers.usage.single')}</option>
                  <option value="n">{t('vouchers.usage.n')}</option>
                  <option value="multi">{t('vouchers.usage.multi')}</option>
                </select>
                {usage === 'n' && <input type="number" min={2} required value={quota} onChange={(e) => setQuota(e.target.value)} className="w-20" aria-label={t('vouchers.deviceCount')} />}
              </div>
            </Field>
            <Field label="Download (Mbit/s)">
              <input inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} placeholder={t('vouchers.unlimited')} className="w-full" />
            </Field>
            <Field label="Upload (Mbit/s)">
              <input inputMode="decimal" value={up} onChange={(e) => setUp(e.target.value)} placeholder={t('vouchers.unlimited')} className="w-full" />
            </Field>
            <Field label={t('vouchers.dataGb')} className="col-span-2">
              <input inputMode="decimal" value={dataLimit} onChange={(e) => setDataLimit(e.target.value)} placeholder={t('vouchers.unlimited')} className="w-full" />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-[90px_1fr] gap-3">
          <Field label={t('vouchers.count')}>
            <input type="number" min={1} max={data.maxBatch} required value={count} onChange={(e) => setCount(e.target.value)} className="w-full" />
          </Field>
          <Field label={data.noteRequired ? t('vouchers.noteRequired') : t('vouchers.note')}>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} required={data.noteRequired} placeholder={t('vouchers.notePlaceholder')} className="w-full" />
          </Field>
        </div>

        {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

        <Button type="submit" variant="primary" disabled={busy} className="w-full py-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
          {t('vouchers.create', { count: Number(count) || 1 })}
        </Button>
      </form>
    </Panel>
  );
}

function PresetOption({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'w-full rounded-lg border px-3 py-2 text-left transition',
        active ? 'border-sky-500/60 bg-sky-500/10' : 'border-noc-line hover:border-slate-500 hover:bg-noc-raised',
      )}
    >
      <div className={clsx('text-sm font-medium', active ? 'text-sky-300' : 'text-noc-text')}>{title}</div>
      {children ? <div className="text-xs text-noc-muted">{children}</div> : null}
    </button>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-[11px] font-medium text-noc-muted">{label}</span>
      {children}
    </label>
  );
}
