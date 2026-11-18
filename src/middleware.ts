/**
 * Zwei-Stufen-Zugriffsschutz:
 *  - "/" und "/api/unifi/*"         → Rolle viewer oder admin (sonst Gate-Seite bzw. 401)
 *  - "/admin" und "/api/admin/*"    → ausschließlich Rolle admin (sonst Admin-Login bzw. 401/403)
 *  - öffentlich: /gate, /api/auth/verify, /api/health, statische Assets
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

const PUBLIC_PATHS = ['/gate', '/api/auth/verify', '/api/health'];

/**
 * Statt HTTP-Redirects wird intern auf die Login-Seite umgeschrieben (Rewrite). Hintergrund:
 * Next.js (standalone) bildet absolute Redirect-URLs aus dem intern gebundenen Host
 * (localhost/0.0.0.0) – hinter Reverse-Proxy/Cloudflare würde der Browser falsch umgeleitet.
 * Die Login-Formulare navigieren nach Erfolg selbst auf die ursprünglich angefragte URL.
 */
function showPage(req: NextRequest, path: string) {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.search = '';
  return NextResponse.rewrite(url, { headers: { 'Cache-Control': 'no-store' } });
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith('/api/');

  // Ohne gültige Session: alles außer öffentlichen Pfaden → Gate
  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
    const res = showPage(req, '/gate');
    if (req.cookies.get(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Admin-Login-Seite und Upgrade-Endpunkt: gültige Viewer-Session genügt
  if (pathname === '/admin/login' || pathname === '/api/auth/admin' || pathname === '/api/auth/logout') {
    return NextResponse.next();
  }

  const adminOnly = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin');
  if (adminOnly && session.role !== 'admin') {
    if (isApi) return NextResponse.json({ error: 'Admin-Rechte erforderlich' }, { status: 403 });
    return showPage(req, '/admin/login');
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
