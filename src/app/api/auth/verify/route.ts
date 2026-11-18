import { NextResponse } from 'next/server';
import { clearRateLimit, getClientIp, rateLimited, safeEqual, verifyTurnstile } from '@/lib/auth';
import { getAuthConfig } from '@/lib/env';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Initiales Zugangs-Gate: prüft ACCESS_PASSWORD (optional) + Cloudflare Turnstile (optional). */
export async function POST(req: Request) {
  const ip = (await getClientIp());
  const rlKey = `gate:${ip || 'unknown'}`;
  if (rateLimited(rlKey)) {
    return NextResponse.json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' }, { status: 429 });
  }

  let body: { password?: unknown; token?: unknown; 'cf-turnstile-response'?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const cfg = getAuthConfig();
  if (!cfg.accessPassword && !cfg.turnstileEnabled) {
    console.warn('[auth] Weder ACCESS_PASSWORD noch TURNSTILE_ENABLED gesetzt – Gate ist offen.');
  }

  if (cfg.accessPassword) {
    const pw = typeof body.password === 'string' ? body.password : '';
    if (!safeEqual(pw, cfg.accessPassword)) {
      return NextResponse.json({ error: 'Falsches Zugangspasswort' }, { status: 401 });
    }
  }

  if (cfg.turnstileEnabled) {
    const raw = body.token ?? body['cf-turnstile-response'];
    const token = typeof raw === 'string' ? raw : '';
    if (!(await verifyTurnstile(token, ip))) {
      return NextResponse.json({ error: 'Bot-Prüfung fehlgeschlagen. Bitte erneut versuchen.' }, { status: 403 });
    }
  }

  clearRateLimit(rlKey);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken('viewer'), sessionCookieOptions());
  return res;
}
