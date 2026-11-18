import { NextResponse } from 'next/server';
import { clearRateLimit, getClientIp, getSession, rateLimited, safeEqual } from '@/lib/auth';
import { getAuthConfig } from '@/lib/env';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Hebt eine gültige Viewer-Session per ADMIN_PASSWORD auf role "admin" an. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });

  const rlKey = `admin:${(await getClientIp()) || 'unknown'}`;
  if (rateLimited(rlKey)) {
    return NextResponse.json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.' }, { status: 429 });
  }

  const { adminPassword } = getAuthConfig();
  if (!adminPassword) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD ist nicht konfiguriert' }, { status: 503 });
  }
  let password = '';
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  if (!safeEqual(password, adminPassword)) {
    return NextResponse.json({ error: 'Falsches Admin-Passwort' }, { status: 401 });
  }
  clearRateLimit(rlKey);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken('admin'), sessionCookieOptions());
  return res;
}

/** Admin-Rechte abgeben (zurück auf viewer). */
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken('viewer'), sessionCookieOptions());
  return res;
}
