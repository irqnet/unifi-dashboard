/**
 * Locale configuration shared by server, client and middleware (no Node APIs).
 */
export const LOCALES = ['en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** English is the primary language and the fallback for everything else. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Cookie holding the visitor's explicit language choice. */
export const LOCALE_COOKIE = 'ud_lang';

/** BCP 47 tags used for date/number formatting (en-GB → 24-hour clock). */
export const LOCALE_TAGS: Record<Locale, string> = { en: 'en-GB', de: 'de-DE' };

/** Native names shown in the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', de: 'Deutsch' };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/**
 * Picks the best supported language from an Accept-Language header
 * (e.g. "de-AT,de;q=0.9,en;q=0.8" → "de"). Returns null if none matches.
 */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, idx) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number.parseFloat(q.slice(2)) : 1, idx };
    })
    .filter((x) => x.lang && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.idx - b.idx);
  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return null;
}
