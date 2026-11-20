/**
 * Server-side locale resolution. Order:
 *   1. language stored on the signed-in user account
 *   2. explicit choice in the ud_lang cookie
 *   3. browser language (Accept-Language)
 *   4. instance default from Admin → General (English unless changed)
 */
import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSettings, getUser } from '../db';
import { SESSION_COOKIE, verifySessionToken } from '../session';
import { isLocale, LOCALE_COOKIE, matchAcceptLanguage, type Locale } from './config';
import { createT, translate, type MessageKey, type TFunction, type TParams } from './translate';

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  try {
    const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
    if (session?.uid !== undefined) {
      const lang = getUser(session.uid)?.language;
      if (lang) return lang;
    }
  } catch {
    /* missing SESSION_SECRET etc. – fall through */
  }
  const cookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const fromBrowser = matchAcceptLanguage((await headers()).get('accept-language'));
  if (fromBrowser) return fromBrowser;
  try {
    return getSettings().defaultLanguage;
  } catch {
    return 'en';
  }
}

export async function getT(): Promise<TFunction> {
  return createT(await getLocale());
}

export function localeCookieOptions() {
  return { path: '/', sameSite: 'lax' as const, maxAge: 365 * 24 * 3600, httpOnly: false };
}

/** JSON error response with a message in the requester's language. */
export async function apiError(key: MessageKey, status: number, params?: TParams): Promise<NextResponse> {
  return NextResponse.json({ error: translate(await getLocale(), key, params) }, { status });
}
