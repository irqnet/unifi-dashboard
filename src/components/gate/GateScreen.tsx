import { AuthShell } from '@/components/ui/AuthShell';
import { getSettings } from '@/lib/db';
import { getAuthConfig } from '@/lib/env';
import { getT } from '@/lib/i18n/server';
import { GateForm } from './GateForm';

/** Login gate (server component) – also rendered directly on protected status pages. */
export async function GateScreen({ next, subtitle }: { next: string; subtitle?: string }) {
  const t = await getT();
  const cfg = getAuthConfig();
  const secretOk = (process.env.SESSION_SECRET ?? '').length >= 32;
  const turnstileMisconfigured = cfg.turnstileEnabled && (!cfg.turnstileSiteKey || !cfg.turnstileSecretKey);
  const sharedAccess = getSettings().allowSharedAccess;

  return (
    <AuthShell title="UniFi Network Status" subtitle={subtitle ?? t('gate.subtitle')} footer={t('gate.footer')}>
      {!secretOk ? (
        <p className="text-sm text-rose-300">
          {t('gate.configError')} <code>SESSION_SECRET</code> {t('gate.secretTooShort')}
        </p>
      ) : turnstileMisconfigured ? (
        <p className="text-sm text-rose-300">
          {t('gate.configError')} <code>TURNSTILE_ENABLED=true</code>{t('gate.turnstileKeyMissing')}
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
