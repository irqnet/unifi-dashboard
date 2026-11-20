import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { setUserLanguage } from '@/lib/db';
import { isLocale, LOCALE_COOKIE } from '@/lib/i18n/config';
import { apiError, localeCookieOptions } from '@/lib/i18n/server';
import { readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/**
 * Stores the visitor's language choice: always as a cookie, and additionally on the
 * user account when signed in with one (so it follows the user across devices).
 * Public on purpose – the gate and public status pages offer the switcher too.
 */
export async function POST(req: Request) {
  const body = (await readJson(req)) as { locale?: unknown } | null;
  if (!isLocale(body?.locale)) return apiError('api.badRequest', 400);
  const session = await getSession();
  if (session?.uid !== undefined) setUserLanguage(session.uid, body.locale);
  const res = NextResponse.json({ ok: true, locale: body.locale });
  res.cookies.set(LOCALE_COOKIE, body.locale, localeCookieOptions());
  return res;
}
