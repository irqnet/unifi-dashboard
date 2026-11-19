'use client';

import clsx from 'clsx';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'ud.theme';
const EVENT = 'ud-theme';

/**
 * Wird als Inline-Skript im <head> ausgeführt, bevor die Seite gezeichnet wird
 * (kein Aufflackern). Muss eigenständig sein – keine Imports.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${KEY}');var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){var d=p==='dark'||(p!=='light'&&m.matches);var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);}a();m.addEventListener('change',function(){p=localStorage.getItem('${KEY}');a();});}catch(e){}})();`;

function readPref(): ThemePref {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  el.classList.toggle('light', !dark);
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', dark ? '#0a0d12' : '#f5f5f7');
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>('system');
  useEffect(() => {
    setPref(readPref());
    const on = () => setPref(readPref());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const set = useCallback((p: ThemePref) => {
    try {
      if (p === 'system') window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
    apply(p);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [pref, set];
}

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Hell', icon: Sun },
  { value: 'dark', label: 'Dunkel', icon: Moon },
];

/** Segment-Umschalter System/Hell/Dunkel. `labels` zeigt die Beschriftung neben den Symbolen. */
export function ThemeSwitcher({ className, labels = false }: { className?: string; labels?: boolean }) {
  const [pref, setPref] = useThemePref();
  return (
    <div className={clsx('inline-flex rounded-lg border border-noc-line bg-noc-raised p-0.5', className)} role="radiogroup" aria-label="Darstellung">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          title={label}
          aria-label={label}
          onClick={() => setPref(value)}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
            pref === value ? 'bg-noc-panel text-noc-text shadow-sm ring-1 ring-inset ring-noc-line' : 'text-noc-muted hover:text-noc-text',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {labels && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
