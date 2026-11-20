'use client';

import { ArrowDown, ArrowUp, Cable, EyeOff, Wifi, X } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '@/components/i18n/I18nProvider';
import { formatBps } from '@/lib/format';
import type { ClientRow, NetworkView } from '@/lib/views';
import type { DetailTarget } from './NetworkCards';
import { VlanTag } from './NetworkCards';
import { TrafficChart } from './TrafficChart';

function ClientTable({ rows, networks, showNetwork }: { rows: ClientRow[]; networks: Record<string, NetworkView>; showNetwork: boolean }) {
  const t = useT();
  if (!rows.length) return <p className="text-sm text-noc-muted">{t('detail.noClients')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-noc-line text-left text-[11px] uppercase tracking-wider text-noc-muted">
            <th className="py-2 pr-3 font-medium">Client</th>
            {showNetwork && <th className="py-2 pr-3 font-medium">{t('detail.network')}</th>}
            <th className="py-2 pr-3 font-medium">{t('detail.connectedVia')}</th>
            <th className="py-2 pr-3 text-right font-medium">↓</th>
            <th className="py-2 text-right font-medium">↑</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.key} className="border-b border-noc-line/50 last:border-0">
              <td className="py-2 pr-3">
                <div className="flex items-center gap-2">
                  {c.wired ? <Cable className="h-3.5 w-3.5 shrink-0 text-noc-muted" /> : <Wifi className="h-3.5 w-3.5 shrink-0 text-noc-muted" />}
                  <div className="min-w-0">
                    <div className="truncate text-noc-text">{c.name}</div>
                    {(c.ip || c.mac) && (
                      <div className="truncate font-mono text-[11px] text-noc-muted">{[c.ip, c.mac].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                </div>
              </td>
              {showNetwork && <td className="py-2 pr-3 text-noc-muted">{networks[c.networkId]?.name ?? '–'}</td>}
              <td className="py-2 pr-3 text-noc-muted">{c.via ?? '–'}</td>
              <td className="py-2 pr-3 text-right font-mono tabular-nums text-sky-300">{formatBps(c.down)}</td>
              <td className="py-2 text-right font-mono tabular-nums text-violet-300">{formatBps(c.up)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetailDrawer({
  target,
  networks,
  onClose,
  onOpen,
}: {
  target: DetailTarget;
  networks: Record<string, NetworkView>;
  onClose: () => void;
  onOpen: (target: DetailTarget) => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isGroup = target.kind === 'group';
  const item = isGroup ? target.group : target.network;
  const memberNets = isGroup ? target.group.networkIds.map((id) => networks[id]).filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-3xl overflow-y-auto border-l border-noc-line bg-noc-bg p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-noc-muted">{isGroup ? t('detail.networkGroup') : t('detail.network')}</div>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-noc-text">
              {isGroup && <span className="h-3 w-3 rounded-full" style={{ background: target.group.color }} />}
              {item.name}
              {item.anonymized && <EyeOff className="h-4 w-4 text-noc-muted" />}
            </h2>
            {!isGroup && (
              <div className="mt-1 flex items-center gap-2">
                <VlanTag vlan={target.network.vlan} />
                <span className="font-mono text-xs text-noc-muted">{target.network.subnet}</span>
              </div>
            )}
            {isGroup && target.group.description && <p className="mt-1 text-sm text-noc-muted">{target.group.description}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-noc-muted hover:bg-noc-raised hover:text-noc-text" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Clients', item.clients.total, 'text-noc-text'],
            [`LAN / ${t('common.wlan')}`, `${item.clients.wired} / ${item.clients.wireless}`, 'text-noc-text'],
            ['Download', formatBps(item.down), 'text-sky-300'],
            ['Upload', formatBps(item.up), 'text-violet-300'],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="rounded-lg border border-noc-line bg-noc-panel px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-noc-muted">{label}</div>
              <div className={`font-mono text-lg tabular-nums ${cls}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-xl border border-noc-line bg-noc-panel p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-noc-muted">
            <span>{t('detail.trafficHistory')}</span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1 text-sky-300">
                <ArrowDown className="h-3 w-3" /> Download
              </span>
              <span className="flex items-center gap-1 text-violet-300">
                <ArrowUp className="h-3 w-3" /> Upload
              </span>
            </span>
          </div>
          <TrafficChart id={`detail-${item.id}`} data={item.history} height={200} />
        </div>

        {isGroup && memberNets.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-noc-muted">{t('detail.byVlan')}</h3>
            <div className="overflow-hidden rounded-xl border border-noc-line">
              {memberNets.map((n) => {
                const share = item.down + item.up > 0 ? ((n.down + n.up) / (item.down + item.up)) * 100 : 0;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onOpen({ kind: 'network', network: n })}
                    className="flex w-full items-center gap-3 border-b border-noc-line bg-noc-panel px-4 py-3 text-left last:border-0 hover:bg-noc-raised"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-noc-text">{n.name}</span>
                        <VlanTag vlan={n.vlan} />
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-noc-line">
                        <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                    <div className="w-16 text-right font-mono text-sm tabular-nums text-noc-text">{n.clients.total}</div>
                    <div className="w-24 text-right font-mono text-xs tabular-nums text-sky-300">{formatBps(n.down)}</div>
                    <div className="w-24 text-right font-mono text-xs tabular-nums text-violet-300">{formatBps(n.up)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-noc-muted">{t('detail.topClients')}</h3>
          {item.anonymized && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-noc-muted">
              <EyeOff className="h-3.5 w-3.5" /> {t('detail.anonymizedHint')}
            </p>
          )}
          <div className="rounded-xl border border-noc-line bg-noc-panel px-4 py-2">
            <ClientTable rows={item.topClients} networks={networks} showNetwork={isGroup} />
          </div>
        </div>
      </div>
    </div>
  );
}
