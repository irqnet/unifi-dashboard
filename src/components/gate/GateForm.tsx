'use client';

import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Turnstile } from './Turnstile';

export function GateForm({
  requirePassword,
  turnstileSiteKey,
  next,
}: {
  requirePassword: boolean;
  turnstileSiteKey: string | null;
  next: string;
}) {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);

  const canSubmit = (!requirePassword || password.length > 0) && (!turnstileSiteKey || !!token) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, token }),
      });
      if (res.ok) {
        // Bei Rewrite durch die Middleware steht die ursprünglich angefragte URL in der Adresszeile
        const here = window.location.pathname + window.location.search;
        window.location.assign(window.location.pathname === '/gate' ? next : here);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Zugang verweigert');
      setReset((n) => n + 1);
    } catch {
      setError('Netzwerkfehler – bitte erneut versuchen');
      setReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {requirePassword && (
        <div>
          <label htmlFor="password" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-noc-muted">
            <KeyRound className="h-3.5 w-3.5" /> Zugangspasswort
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full"
            placeholder="••••••••"
          />
        </div>
      )}
      {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} resetSignal={reset} />}
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Dashboard öffnen
      </button>
    </form>
  );
}
