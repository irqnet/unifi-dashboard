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
import { LOCALE_COOKIE } from '@/lib/i18n/config';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';
import { apiError, localeCookieOptions } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * Access gate: Cloudflare Turnstile (optional), then either
 *  - user account (username + password) → role "user" or "admin", or
 *  - shared access via ACCESS_PASSWORD (optional) → role "viewer" (full overview).
 */
export async function POST(req: Request) {
  const ip = await getClientIp();
  const rlKey = `gate:${ip || 'unknown'}`;
  if (rateLimited(rlKey)) {
    return apiError('api.tooManyAttempts', 429);
  }

  let body: { username?: unknown; password?: unknown; token?: unknown; 'cf-turnstile-response'?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return apiError('api.badRequest', 400);
  }

  const cfg = getAuthConfig();
  if (cfg.turnstileEnabled) {
    const raw = body.token ?? body['cf-turnstile-response'];
    const token = typeof raw === 'string' ? raw : '';
    if (!(await verifyTurnstile(token, ip))) {
      return apiError('api.botCheckFailed', 403);
    }
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const pw = typeof body.password === 'string' ? body.password : '';

  // --- User account -----------------------------------------------------------
  if (username) {
    const found = username.length <= 64 ? findUserForLogin(username) : null;
    const ok = await verifyPassword(pw, found?.passwordHash ?? (await getDummyHash()));
    if (!found || !ok || found.user.disabled) {
      return apiError('api.wrongCredentials', 401);
    }
    clearRateLimit(rlKey);
    touchUserLogin(found.user.id);
    const res = NextResponse.json({ ok: true, role: found.user.isAdmin ? 'admin' : 'user' });
    if (found.user.language) res.cookies.set(LOCALE_COOKIE, found.user.language, localeCookieOptions());
    res.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(found.user.isAdmin ? 'admin' : 'user', found.user),
      sessionCookieOptions(),
    );
    return res;
  }

  // --- Shared access ----------------------------------------------------------
  if (!getSettings().allowSharedAccess) {
    return apiError('api.accountLoginRequired', 401);
  }
  if (!cfg.accessPassword && !cfg.turnstileEnabled) {
    console.warn('[auth] Neither ACCESS_PASSWORD nor TURNSTILE_ENABLED is set – the gate is open.');
  }
  if (cfg.accessPassword && !safeEqual(pw, cfg.accessPassword)) {
    return apiError('api.wrongAccessPassword', 401);
  }

  clearRateLimit(rlKey);
  const res = NextResponse.json({ ok: true, role: 'viewer' });
  res.cookies.set(SESSION_COOKIE, await createSessionToken('viewer'), sessionCookieOptions());
  return res;
}
