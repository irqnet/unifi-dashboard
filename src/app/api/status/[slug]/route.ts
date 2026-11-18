import { NextResponse } from 'next/server';
import { canViewPage, findPage, getSession, visiblePages } from '@/lib/auth';
import { buildDashboard } from '@/lib/unifi/aggregate';

export const dynamic = 'force-dynamic';

/**
 * Daten einer Statusseite. Zugriff: öffentliche Seite, Admin, gemeinsamer Zugang
 * oder Benutzerkonto mit Zuweisung. Die Antwort enthält ausschließlich die Gruppen
 * der Seite – Daten anderer Netze/Geräte verlassen den Server nicht.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const page = findPage((await params).slug);
  const session = await getSession();
  // Unbekannte und nicht erlaubte Seiten sind nicht unterscheidbar
  if (!page || !canViewPage(session, page)) {
    return NextResponse.json({ error: session ? 'Kein Zugriff' : 'Nicht authentifiziert' }, { status: session ? 403 : 401 });
  }
  try {
    const pages = visiblePages(session).map((p) => ({ slug: p.slug, title: p.title }));
    const payload = await buildDashboard(page.site, false, { page, pages, loggedIn: !!session });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api] status page:', err);
    return NextResponse.json({ error: 'Statusseite konnte nicht erstellt werden' }, { status: 500 });
  }
}
