import { redirect } from 'next/navigation';
import { GateForm } from '@/components/gate/GateForm';
import { AuthShell } from '@/components/ui/AuthShell';
import { getSession } from '@/lib/auth';
import { getAuthConfig } from '@/lib/env';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  // Nur relative, interne Pfade erlauben (kein Open Redirect)
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);

  const cfg = getAuthConfig();
  const secretOk = (process.env.SESSION_SECRET ?? '').length >= 32;
  const turnstileMisconfigured = cfg.turnstileEnabled && (!cfg.turnstileSiteKey || !cfg.turnstileSecretKey);

  return (
    <AuthShell title="UniFi Network Status" subtitle="Geschützter Bereich" footer="Zugriff wird protokolliert · Session-Cookie: HttpOnly, SameSite=Strict">
      {!secretOk ? (
        <p className="text-sm text-rose-300">
          Konfigurationsfehler: <code>SESSION_SECRET</code> muss mindestens 32 Zeichen lang sein.
        </p>
      ) : turnstileMisconfigured ? (
        <p className="text-sm text-rose-300">
          Konfigurationsfehler: <code>TURNSTILE_ENABLED=true</code>, aber Site- oder Secret-Key fehlt.
        </p>
      ) : (
        <GateForm
          requirePassword={!!cfg.accessPassword}
          turnstileSiteKey={cfg.turnstileEnabled ? cfg.turnstileSiteKey : null}
          next={next}
        />
      )}
    </AuthShell>
  );
}
