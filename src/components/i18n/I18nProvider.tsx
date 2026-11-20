'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALE_TAGS, LOCALES, type Locale } from '@/lib/i18n/config';
import { createT, type TFunction } from '@/lib/i18n/translate';

interface I18nContextValue {
  locale: Locale;
  /** BCP 47 tag for Intl/toLocale* calls */
  tag: string;
  t: TFunction;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setState] = useState<Locale>(initial);
  // Follow the server when it resolves a different locale (e.g. after login)
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setState(initial);
  }

  const setLocale = useCallback(
    (next: Locale) => {
      setState(next);
      document.documentElement.lang = next;
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
      // Persist on the user account (no-op without one), then re-render server components
      fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      })
        .catch(() => null)
        .finally(() => router.refresh());
    },
    [router],
  );

  const value = useMemo(() => ({ locale, tag: LOCALE_TAGS[locale], t: createT(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}

/** Segmented EN/DE switch. `labels` shows the native language names instead of codes. */
export function LanguageSwitcher({ className, labels = false }: { className?: string; labels?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={clsx('inline-flex rounded-lg border border-noc-line bg-noc-raised p-0.5', className)} role="radiogroup" aria-label={t('common.language')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          title={LOCALE_NAMES[l]}
          lang={l}
          onClick={() => locale !== l && setLocale(l)}
          className={clsx(
            'flex flex-1 items-center justify-center rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
            locale === l ? 'bg-noc-panel text-noc-text shadow-sm ring-1 ring-inset ring-noc-line' : 'text-noc-muted hover:text-noc-text',
          )}
        >
          {labels ? LOCALE_NAMES[l] : l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
