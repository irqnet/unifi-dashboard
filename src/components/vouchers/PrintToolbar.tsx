'use client';

import { Printer } from 'lucide-react';
import { useEffect } from 'react';
import { useT } from '@/components/i18n/I18nProvider';
import { LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n/config';

export function PrintToolbar({ count, layout, lang, autoPrint }: { count: number; layout: 'a4' | 'bon'; lang: Locale; autoPrint: boolean }) {
  const t = useT();
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  function setParam(key: string, value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.location.assign(url.toString());
  }

  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-300 bg-white/90 px-4 py-2 text-sm text-slate-700 backdrop-blur">
      <span className="font-medium">{t('print.count', { count })}</span>
      <div className="flex overflow-hidden rounded-md border border-slate-300">
        {(['a4', 'bon'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setParam('layout', l)}
            className={`px-3 py-1 ${layout === l ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
          >
            {l === 'a4' ? t('print.layoutA4') : t('print.layoutReceipt')}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">{t('print.language')}</span>
        <select
          value={lang}
          onChange={(e) => setParam('lang', e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <span className="text-xs text-slate-500">{t('print.pdfTip')}</span>
      <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700">
        <Printer className="h-4 w-4" /> {t('print.print')}
      </button>
    </div>
  );
}
