import { NextResponse } from 'next/server';
import { clearRateLimit, getClientIp, getSession, rateLimited, safeEqual } from '@/lib/auth';
import { getUser } from '@/lib/db';
import { getAuthConfig } from '@/lib/env';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** Upgrades a valid viewer session to role "admin" via ADMIN_PASSWORD. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return apiError('api.unauthenticated', 401);

  const rlKey = `admin:${(await getClientIp()) || 'unknown'}`;
  if (rateLimited(rlKey)) {
    return apiError('api.tooManyAttempts', 429);
  }

  const { adminPassword } = getAuthConfig();
  if (!adminPassword) {
    return apiError('api.adminPasswordMissing', 503);
  }
  let password = '';
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return apiError('api.badRequest', 400);
  }
  if (!safeEqual(password, adminPassword)) {
    return apiError('api.wrongAdminPassword', 401);
  }
  clearRateLimit(rlKey);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken('admin'), sessionCookieOptions());
  return res;
}

/** Drop admin rights (user account → user, shared access → viewer). */
export async function DELETE() {
  const session = await getSession();
  if (!session) return apiError('api.unauthenticated', 401);
  const user = session.uid !== undefined ? getUser(session.uid) : null;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    user ? await createSessionToken('user', user) : await createSessionToken('viewer'),
    sessionCookieOptions(),
  );
  return res;
}
