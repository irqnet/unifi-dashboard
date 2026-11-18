'use client';

import { KeyRound, Loader2, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { Turnstile } from './Turnstile';

export function GateForm({
  sharedAccess,
  requirePassword,
  turnstileSiteKey,
  next,
}: {
  /** Anmeldung ohne Benutzerkonto (gemeinsamer Zugang) erlaubt */
  sharedAccess: boolean;
  /** ACCESS_PASSWORD für den gemeinsamen Zugang gesetzt */
  requirePassword: boolean;
  turnstileSiteKey: string | null;
  next: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(0);

  const withUser = username.trim().length > 0;
  const credentialsOk = withUser ? password.length > 0 : sharedAccess && (!requirePassword || password.length > 0);
  const showPassword = withUser || requirePassword || !sharedAccess;
  const canSubmit = credentialsOk && (!turnstileSiteKey || !!token) && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, token }),
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
      <div>
        <label htmlFor="username" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-noc-muted">
          <User className="h-3.5 w-3.5" /> Benutzername
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full"
          placeholder={sharedAccess ? 'leer lassen für gemeinsamen Zugang' : ''}
        />
      </div>
      {showPassword && (
        <div>
          <label htmlFor="password" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-noc-muted">
            <KeyRound className="h-3.5 w-3.5" /> {withUser || !sharedAccess ? 'Passwort' : 'Zugangspasswort'}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
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
