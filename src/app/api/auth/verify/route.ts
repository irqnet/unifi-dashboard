import { NextResponse } from 'next/server';
import {
  clearRateLimit,
  getClientIp,
  getDummyHash,
  rateLimited,
  safeEqual,
  verifyPassword,
  verifyTurnstile,
} from '@/lib/auth';
import { findUserForLogin, getSettings, touchUserLogin } from '@/lib/db';
import { getAuthConfig } from '@/lib/env';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Zugangs-Gate: Cloudflare Turnstile (optional) und anschließend entweder
 *  - Benutzerkonto (Benutzername + Passwort) → Rolle "user" bzw. "admin", oder
 *  - gemeinsamer Zugang über ACCESS_PASSWORD (optional) → Rolle "viewer" (Gesamtansicht).
 */
export async function POST(req: Request) {
  const ip = await getClientIp();
  const rlKey = `gate:${ip || 'unknown'}`;
  if (rateLimited(rlKey)) {
    return NextResponse.json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' }, { status: 429 });
  }

  let body: { username?: unknown; password?: unknown; token?: unknown; 'cf-turnstile-response'?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const cfg = getAuthConfig();
  if (cfg.turnstileEnabled) {
    const raw = body.token ?? body['cf-turnstile-response'];
    const token = typeof raw === 'string' ? raw : '';
    if (!(await verifyTurnstile(token, ip))) {
      return NextResponse.json({ error: 'Bot-Prüfung fehlgeschlagen. Bitte erneut versuchen.' }, { status: 403 });
    }
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const pw = typeof body.password === 'string' ? body.password : '';

  // --- Benutzerkonto ---------------------------------------------------------
  if (username) {
    const found = username.length <= 64 ? findUserForLogin(username) : null;
    const ok = await verifyPassword(pw, found?.passwordHash ?? (await getDummyHash()));
    if (!found || !ok || found.user.disabled) {
      return NextResponse.json({ error: 'Benutzername oder Passwort falsch' }, { status: 401 });
    }
    clearRateLimit(rlKey);
    touchUserLogin(found.user.id);
    const res = NextResponse.json({ ok: true, role: found.user.isAdmin ? 'admin' : 'user' });
    res.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(found.user.isAdmin ? 'admin' : 'user', found.user),
      sessionCookieOptions(),
    );
    return res;
  }

  // --- Gemeinsamer Zugang ----------------------------------------------------
  if (!getSettings().allowSharedAccess) {
    return NextResponse.json({ error: 'Bitte mit Benutzername und Passwort anmelden' }, { status: 401 });
  }
  if (!cfg.accessPassword && !cfg.turnstileEnabled) {
    console.warn('[auth] Weder ACCESS_PASSWORD noch TURNSTILE_ENABLED gesetzt – Gate ist offen.');
  }
  if (cfg.accessPassword && !safeEqual(pw, cfg.accessPassword)) {
    return NextResponse.json({ error: 'Falsches Zugangspasswort' }, { status: 401 });
  }

  clearRateLimit(rlKey);
  const res = NextResponse.json({ ok: true, role: 'viewer' });
  res.cookies.set(SESSION_COOKIE, await createSessionToken('viewer'), sessionCookieOptions());
  return res;
}
