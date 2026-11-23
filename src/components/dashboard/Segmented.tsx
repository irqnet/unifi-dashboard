'use client';

/** Small segmented switch used in the WAN tiles. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-noc-line bg-noc-bg/60 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 font-medium ${value === o.value ? 'bg-fg/10 text-noc-text' : 'text-noc-muted hover:text-noc-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function readLocal<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
