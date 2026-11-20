'use client';

/**
 * UI building blocks for the admin area in the style of macOS/iOS settings:
 * grouped lists, rows with a switch or chevron, editing in a sheet.
 */

import clsx from 'clsx';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '@/components/i18n/I18nProvider';

export type Api = <T>(url: string, init?: RequestInit) => Promise<{ data?: T; error?: string }>;

export const PRESET_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#fb7185', '#2dd4bf', '#94a3b8'];

// --- Page header ----------------------------------------------------------------------

export function PageHeader({ title, lead, action }: { title: string; lead?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-7">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[26px] font-bold tracking-tight text-noc-strong">{title}</h1>
        {action}
      </div>
      {lead && <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-noc-muted">{lead}</p>}
    </div>
  );
}

export function PrimaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-[13px] font-medium text-slate-950 transition-colors hover:bg-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LinkButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={clsx('text-[13px] font-normal text-sky-400 hover:text-sky-300 focus:outline-none focus-visible:underline disabled:opacity-40', className)}
    >
      {children}
    </button>
  );
}

// --- Grouped list ------------------------------------------------------------------

export function Group({
  title,
  aside,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('mb-7', className)}>
      {(title || aside) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 px-3.5">
          <h2 className="text-[13px] font-semibold text-noc-muted">{title}</h2>
          {aside && <div className="text-[13px] text-noc-muted">{aside}</div>}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-noc-group ring-1 ring-inset ring-fg/[0.04] [&>*+*]:border-t [&>*+*]:border-fg/[0.06]">
        {children}
      </div>
      {footer && <p className="mt-1.5 px-3.5 text-xs leading-relaxed text-noc-muted">{footer}</p>}
    </section>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  detail,
  onClick,
  chevron,
  className,
  children,
  dim,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
  children?: ReactNode;
  dim?: boolean;
}) {
  const body = (
    <>
      {icon}
      <div className={clsx('min-w-0 flex-1', dim && 'opacity-55')}>
        <div className="truncate text-sm font-medium text-noc-text">{title}</div>
        {subtitle && <div className="truncate text-[12.5px] text-noc-muted">{subtitle}</div>}
      </div>
      {detail && <div className="flex min-w-0 shrink-0 items-center gap-2 text-[13px] text-noc-muted">{detail}</div>}
      {children}
      {(chevron ?? !!onClick) && <ChevronRight className="h-4 w-4 shrink-0 text-noc-faint" />}
    </>
  );
  const cls = clsx('flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 text-left', className);
  return onClick ? (
    <button type="button" onClick={onClick} className={clsx(cls, 'transition-colors hover:bg-fg/[0.03] focus:outline-none focus-visible:bg-fg/[0.05]')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Row with title, explanation and a switch on the right. */
export function SwitchRow({
  title,
  subtitle,
  checked,
  onChange,
  disabled,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-3.5 py-2.5">
      <label htmlFor={id} className={clsx('min-w-0 flex-1 cursor-pointer', disabled && 'cursor-default opacity-50')}>
        <div className="text-sm font-medium text-noc-text">{title}</div>
        {subtitle && <div className="text-[12.5px] leading-snug text-noc-muted">{subtitle}</div>}
      </label>
      <Switch id={id} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  id,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-[23px] w-[38px] shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-noc-group disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-[#30d158]' : 'bg-noc-off',
      )}
    >
      <span
        className={clsx(
          'absolute left-[2px] top-[2px] h-[19px] w-[19px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.4)] transition-transform duration-200',
          checked && 'translate-x-[15px]',
        )}
      />
    </button>
  );
}

export function ColorDot({ color, round }: { color: string; round?: boolean }) {
  return (
    <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center', round ? 'rounded-full' : 'rounded-lg')} style={{ background: `${color}2e` }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function Pill({ tone = 'neutral', children, icon }: { tone?: 'neutral' | 'warn' | 'ok' | 'danger' | 'info'; children: ReactNode; icon?: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-[11.5px] font-medium',
        tone === 'neutral' && 'bg-fg/[0.06] text-noc-muted',
        tone === 'warn' && 'bg-amber-400/[0.12] text-amber-300',
        tone === 'ok' && 'bg-emerald-400/[0.12] text-emerald-300',
        tone === 'danger' && 'bg-rose-400/[0.12] text-rose-300',
        tone === 'info' && 'bg-sky-400/[0.12] text-sky-300',
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function EmptyRow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-noc-muted">
      <p className="max-w-[48ch]">{children}</p>
      {action}
    </div>
  );
}

export function LoadingRow() {
  return (
    <div className="flex items-center gap-2 px-3.5 py-4 text-sm text-noc-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …
    </div>
  );
}

// --- Form rows ------------------------------------------------------------------

export function FieldRow({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-h-[46px] flex-col gap-1 px-3.5 py-2 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor={htmlFor} className="shrink-0 text-[13px] text-noc-muted sm:w-32">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('admin-input', props.className)} />;
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={clsx(
            'h-[22px] w-[22px] rounded-full ring-offset-2 ring-offset-noc-group focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
            value.toLowerCase() === c && 'ring-2 ring-white',
          )}
          style={{ background: c }}
          aria-label={`Farbe ${c}`}
          aria-pressed={value.toLowerCase() === c}
        />
      ))}
      <label
        className={clsx(
          'relative h-[22px] w-[22px] cursor-pointer overflow-hidden rounded-full ring-offset-2 ring-offset-noc-group',
          !PRESET_COLORS.includes(value.toLowerCase()) && 'ring-2 ring-white',
        )}
        style={{ background: 'conic-gradient(#f87171,#fbbf24,#34d399,#38bdf8,#a78bfa,#f472b6,#f87171)' }}
        title={t('admin.customColor')}
      >
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t('admin.customColor')} />
      </label>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-fg/[0.06] p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            'rounded-md px-3 py-1 text-[12.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
            value === v ? 'bg-noc-seg text-noc-strong shadow-sm' : 'text-noc-muted hover:text-noc-text',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Selection row with a round check mark (multi-select in sheets). */
export function CheckRow({
  checked,
  onToggle,
  title,
  subtitle,
  detail,
  icon,
}: {
  checked: boolean;
  onToggle: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex min-h-[44px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-fg/[0.03] focus:outline-none focus-visible:bg-fg/[0.05]"
    >
      <span
        className={clsx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
          checked ? 'border-sky-500 bg-sky-500 text-slate-950' : 'border-noc-radio',
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-noc-text">{title}</span>
        {subtitle && <span className="block truncate text-[12px] text-noc-muted">{subtitle}</span>}
      </span>
      {detail && <span className="shrink-0 font-mono text-[12px] text-noc-muted">{detail}</span>}
    </button>
  );
}

// --- Sheet (edit dialog) --------------------------------------------------------------

export function Sheet({
  title,
  onCancel,
  onSubmit,
  busy,
  error,
  submitLabel,
  children,
}: {
  title: string;
  onCancel: () => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: string | null;
  submitLabel?: string;
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('input, button[role="checkbox"], textarea, select');
    first?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[3px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-noc-sheet shadow-[0_30px_80px_rgba(0,0,0,.6)] ring-1 ring-fg/[0.07] sm:max-w-[560px] sm:rounded-2xl"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onSubmit();
          }}
        >
          <header className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-fg/[0.07] px-4 py-3">
            <LinkButton onClick={onCancel} className="justify-self-start text-[15px]">
              {t('common.cancel')}
            </LinkButton>
            <h2 id={titleId} className="text-[15px] font-semibold text-noc-strong">
              {title}
            </h2>
            <button type="submit" disabled={busy} className="justify-self-end text-[15px] font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel ?? t('common.save')}
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-5">
            {error && (
              <div role="alert" className="mb-5 rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200 ring-1 ring-inset ring-rose-500/25">
                {error}
              </div>
            )}
            {children}
          </div>
        </form>
      </div>
    </div>
  );
}

/** Red delete row with in-place confirmation. */
export function DeleteRow({
  label,
  confirming,
  onAsk,
  onConfirm,
  onCancel,
  disabled,
  hint,
}: {
  label: string;
  confirming: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const t = useT();
  return (
    <Group footer={hint}>
      {confirming ? (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="text-sm text-noc-text">{t('admin.confirmDelete')}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[13px] text-noc-muted hover:bg-fg/[0.05] hover:text-noc-text">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={onConfirm} className="rounded-lg bg-rose-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-rose-400">
              {t('common.delete')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAsk}
          disabled={disabled}
          className="w-full px-3.5 py-3 text-center text-sm font-medium text-rose-400 hover:bg-fg/[0.03] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {label}
        </button>
      )}
    </Group>
  );
}

export function Banner({ tone, children }: { tone: 'warn' | 'danger'; children: ReactNode }) {
  return (
    <div
      role="status"
      className={clsx(
        'mb-6 rounded-xl px-3.5 py-2.5 text-[13px] ring-1 ring-inset',
        tone === 'warn' ? 'bg-amber-400/[0.08] text-amber-200 ring-amber-400/20' : 'bg-rose-500/10 text-rose-200 ring-rose-500/25',
      )}
    >
      {children}
    </div>
  );
}
