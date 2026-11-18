'use client';

import { Printer } from 'lucide-react';
import { useEffect } from 'react';

export function PrintToolbar({ count, layout, autoPrint }: { count: number; layout: 'a4' | 'bon'; autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  function switchLayout(l: 'a4' | 'bon') {
    const url = new URL(window.location.href);
    url.searchParams.set('layout', l);
    window.location.assign(url.toString());
  }

  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-300 bg-white/90 px-4 py-2 text-sm text-slate-700 backdrop-blur">
      <span className="font-medium">{count === 1 ? '1 Voucher' : `${count} Voucher`}</span>
      <div className="flex overflow-hidden rounded-md border border-slate-300">
        {(['a4', 'bon'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => switchLayout(l)}
            className={`px-3 py-1 ${layout === l ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
          >
            {l === 'a4' ? 'A4 (Karten)' : 'Bon 80 mm'}
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-500">Tipp: Im Druckdialog „Als PDF speichern“ wählen, um den Voucher zu versenden.</span>
      <button type="button" onClick={() => window.print()} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700">
        <Printer className="h-4 w-4" /> Drucken
      </button>
    </div>
  );
}
