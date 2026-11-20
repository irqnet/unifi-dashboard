/**
 * Two-tier access control:
 *  - "/" and "/api/unifi/*"         → role viewer or admin (otherwise gate page or 401)
 *  - "/admin", "/vouchers" and "/api/admin/*" → role admin only (otherwise admin login or 401/403)
 *  - user accounts (role user) only see their status pages; "/" shows their overview (/start)
 *  - public: /gate, /api/auth/verify, /api/health, /api/locale, static assets
 *  - status pages /s/<slug> and /api/status/<slug> check access themselves (public pages,
 *    user assignment) – that needs DB access, which is not possible in the middleware
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, LOCALE_COOKIE, matchAcceptLanguage, DEFAULT_LOCALE } from '@/lib/i18n/config';
import { translate, type MessageKey } from '@/lib/i18n/translate';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

// /api/layout checks access itself (layouts also for status page users)
const PUBLIC_PATHS = ['/gate', '/api/auth/verify', '/api/health', '/api/locale', '/s', '/api/status', '/api/layout'];

/**
 * Instead of HTTP redirects the request is rewritten internally to the login page. Reason:
 * Next.js (standalone) builds absolute redirect URLs from the internally bound host
 * (localhost/0.0.0.0) – behind a reverse proxy/Cloudflare the browser would be sent to the wrong place.
 * After success the login forms navigate to the originally requested URL themselves.
 */
function showPage(req: NextRequest, path: string) {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.search = '';
  return NextResponse.rewrite(url, { headers: { 'Cache-Control': 'no-store' } });
}

/** JSON error in the visitor's language (cookie or browser; the DB default is not reachable here). */
function jsonError(req: NextRequest, key: MessageKey, status: number) {
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : (matchAcceptLanguage(req.headers.get('accept-language')) ?? DEFAULT_LOCALE);
  return NextResponse.json({ error: translate(locale, key) }, { status });
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith('/api/');

  // No valid session: everything except public paths → gate
  if (!session) {
    if (isApi) return jsonError(req, 'api.unauthenticated', 401);
    const res = showPage(req, '/gate');
    if (req.cookies.get(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Admin login page and upgrade endpoint: a valid viewer session is enough
  if (pathname === '/admin/login' || pathname === '/api/auth/admin' || pathname === '/api/auth/logout') {
    return NextResponse.next();
  }

  // User accounts without the admin role: only status pages, admin login and sign-out
  if (session.role === 'user') {
    if (pathname === '/start') return NextResponse.next();
    if (isApi) return jsonError(req, 'api.forbidden', 403);
    return showPage(req, '/start');
  }

  const adminOnly =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/admin') ||
    pathname === '/vouchers' ||
    pathname.startsWith('/vouchers/');
  if (adminOnly && session.role !== 'admin') {
    if (isApi) return jsonError(req, 'api.adminRequired', 403);
    return showPage(req, '/admin/login');
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
