import { Activity } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10">
            <Activity className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-noc-text">{title}</h1>
            <p className="text-sm text-noc-muted">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-noc-line bg-noc-panel/90 p-6 shadow-2xl shadow-black/40 backdrop-blur">{children}</div>
        {footer && <div className="mt-4 text-center text-xs text-noc-muted">{footer}</div>}
      </div>
    </main>
  );
}
