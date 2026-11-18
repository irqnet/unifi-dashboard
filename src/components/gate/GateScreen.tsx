import { AuthShell } from '@/components/ui/AuthShell';
import { getSettings } from '@/lib/db';
import { getAuthConfig } from '@/lib/env';
import { GateForm } from './GateForm';

/** Login-Gate (Server-Komponente) – auch direkt auf geschützten Statusseiten verwendet. */
export function GateScreen({ next, subtitle = 'Geschützter Bereich' }: { next: string; subtitle?: string }) {
  const cfg = getAuthConfig();
  const secretOk = (process.env.SESSION_SECRET ?? '').length >= 32;
  const turnstileMisconfigured = cfg.turnstileEnabled && (!cfg.turnstileSiteKey || !cfg.turnstileSecretKey);
  const sharedAccess = getSettings().allowSharedAccess;

  return (
    <AuthShell title="UniFi Network Status" subtitle={subtitle} footer="Zugriff wird protokolliert · Session-Cookie: HttpOnly, SameSite=Strict">
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
          sharedAccess={sharedAccess}
          requirePassword={!!cfg.accessPassword}
          turnstileSiteKey={cfg.turnstileEnabled ? cfg.turnstileSiteKey : null}
          next={next}
        />
      )}
    </AuthShell>
  );
}
