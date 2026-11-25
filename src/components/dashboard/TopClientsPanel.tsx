'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatBps } from '@/lib/format';
import type { ClientRow, GroupView, NetworkView } from '@/lib/views';
import { readLocal, Segmented, writeLocal } from './Segmented';

const SORTS = ['sum', 'down', 'up'] as const;
type Sort = (typeof SORTS)[number];
const ALL = 'all';
const LIMIT = 8;
const OTHER_COLOR = 'rgb(var(--noc-muted))';

interface Row extends ClientRow {
  groupId: string;
  groupName: string;
  color: string;
  anonymous: boolean;
}

/**
 * Clients with the most traffic right now, from the top clients the dashboard already delivers
 * per group (anonymised groups arrive without names). Only on the main dashboard.
 */
export function TopClientsPanel({ groups, networks, ungrouped }: { groups: GroupView[]; networks: Record<string, NetworkView>; ungrouped: string[] }) {
  const { t } = useI18n();
  const [sort, setSort] = useState<Sort>('sum');
  const [filter, setFilter] = useState<string>(ALL);

  useEffect(() => {
    setSort(readLocal('ud.top.sort', SORTS, 'sum'));
  }, []);
  // A filtered group may disappear (hidden in the admin area)
  useEffect(() => {
    if (filter !== ALL && !groups.some((g) => g.id === filter)) setFilter(ALL);
  }, [groups, filter]);

  const all: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const g of groups) {
      for (const c of g.topClients) {
        const anonymous = g.anonymized || !!networks[c.networkId]?.anonymized;
        out.push({ ...c, groupId: g.id, groupName: g.name, color: g.color, anonymous });
      }
    }
    for (const id of ungrouped) {
      const n = networks[id];
      if (!n) continue;
      for (const c of n.topClients) out.push({ ...c, groupId: `net:${id}`, groupName: n.name, color: OTHER_COLOR, anonymous: n.anonymized });
    }
    return out;
  }, [groups, networks, ungrouped]);

  const value = (r: Row) => (sort === 'down' ? r.down : sort === 'up' ? r.up : r.down + r.up);
  const rows = all
    .filter((r) => filter === ALL || r.groupId === filter)
    .filter((r) => r.down + r.up > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, LIMIT);
  const max = Math.max(1, ...rows.map((r) => r.down + r.up));

  return (
    <section className="tile-shadow flex h-full flex-col rounded-xl border border-noc-line bg-noc-panel p-3 @3xl:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-noc-text">
          <ListOrdered className="h-4 w-4 shrink-0 text-noc-muted" /> {t('top.title')}
          <span className="font-normal text-noc-muted">· {t('top.now')}</span>
        </h2>
        <Segmented
          label={t('top.sort')}
          value={sort}
          onChange={(v) => {
            setSort(v);
            writeLocal('ud.top.sort', v);
          }}
          options={[
            { value: 'sum', label: t('top.sortTotal') },
            { value: 'down', label: <ArrowDown className="h-3.5 w-3.5" />, title: 'Download' },
            { value: 'up', label: <ArrowUp className="h-3.5 w-3.5" />, title: 'Upload' },
          ]}
        />
      </div>

      {groups.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={t('top.filter')}>
          {[{ id: ALL, name: t('top.all'), color: '' }, ...groups].map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={filter === g.id}
              onClick={() => setFilter(g.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                filter === g.id ? 'border-noc-text/40 bg-fg/10 text-noc-text' : 'border-noc-line text-noc-muted hover:text-noc-text'
              }`}
            >
              {g.color && <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />}
              {g.name}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex min-h-[120px] flex-1 items-center justify-center text-xs text-noc-muted">{t('top.empty')}</div>
      ) : (
        <ol className="divide-y divide-noc-line/60">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[18px,minmax(0,1fr),auto] items-center gap-x-3 py-1.5 text-xs">
              <span className="text-right font-mono text-noc-muted">{i + 1}</span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className={`truncate text-sm ${r.anonymous ? 'italic text-noc-muted' : 'text-noc-text'}`} title={r.anonymous ? undefined : r.name}>
                    {r.anonymous ? t('top.anonymous') : r.name}
                  </span>
                  <span className="hidden shrink-0 truncate text-noc-muted @lg:inline">
                    {r.groupName} · {r.wired ? 'LAN' : t('top.wifi')}
                  </span>
                </span>
                <span className="mt-1 flex h-1 overflow-hidden rounded-full bg-[rgb(var(--c-track))]">
                  <span style={{ width: `${(r.down / max) * 100}%`, background: 'rgb(var(--c-down))' }} />
                  <span style={{ width: `${(r.up / max) * 100}%`, background: 'rgb(var(--c-up))' }} />
                </span>
              </span>
              <span className="flex flex-col items-end @md:flex-row @md:gap-3">
                <span className="w-[104px] whitespace-nowrap text-right font-mono tabular-nums" style={{ color: 'rgb(var(--c-down))' }}>
                  ↓ {formatBps(r.down)}
                </span>
                <span className="w-[104px] whitespace-nowrap text-right font-mono tabular-nums" style={{ color: 'rgb(var(--c-up))' }}>
                  ↑ {formatBps(r.up)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-auto pt-2 text-[11px] text-noc-muted">{t('top.legend')}</p>
    </section>
  );
}
