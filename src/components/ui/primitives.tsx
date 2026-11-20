'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useT } from '@/components/i18n/I18nProvider';
import type { MessageKey } from '@/lib/i18n/translate';
import type { SystemStatus } from '@/lib/views';

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-xl border border-noc-line bg-noc-panel', className)}>{children}</div>;
}

const STATUS_STYLE: Record<SystemStatus, { label: MessageKey; cls: string; dot: string }> = {
  online: { label: 'status.online', cls: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30', dot: 'bg-emerald-400' },
  degraded: { label: 'status.degraded', cls: 'text-amber-300 bg-amber-500/10 ring-amber-500/30', dot: 'bg-amber-400' },
  offline: { label: 'status.offline', cls: 'text-rose-300 bg-rose-500/10 ring-rose-500/30', dot: 'bg-rose-500' },
  unknown: { label: 'status.unknown', cls: 'text-slate-300 bg-slate-500/10 ring-slate-500/30', dot: 'bg-slate-400' },
};

export function StatusBadge({ status, label, size = 'md' }: { status: SystemStatus; label?: string; size?: 'sm' | 'md' }) {
  const t = useT();
  const s = STATUS_STYLE[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        s.cls,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot, status === 'online' && 'animate-pulse')} />
      {label ?? t(s.label)}
    </span>
  );
}

export function Meter({ value, max = 100, className, warn = 70, crit = 90 }: { value: number | null; max?: number; className?: string; warn?: number; crit?: number }) {
  const pct = value === null ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= crit ? 'bg-rose-500' : pct >= warn ? 'bg-amber-400' : 'bg-sky-400';
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-noc-line', className)}>
      <div className={clsx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-noc-muted">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-sm text-noc-text tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-noc-muted">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-noc-muted">
        {icon}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('inline-flex cursor-pointer select-none items-center gap-2 text-sm', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
          checked ? 'bg-sky-500' : 'bg-noc-line',
        )}
      >
        <span className={clsx('absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
      {label && <span className="text-noc-text">{label}</span>}
    </label>
  );
}

export function Button({
  children,
  variant = 'secondary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-sky-500 text-slate-950 hover:bg-sky-400',
        variant === 'secondary' && 'border border-noc-line bg-noc-raised text-noc-text hover:border-slate-500',
        variant === 'ghost' && 'text-noc-muted hover:bg-noc-raised hover:text-noc-text',
        variant === 'danger' && 'border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
        className,
      )}
    >
      {children}
    </button>
  );
}
