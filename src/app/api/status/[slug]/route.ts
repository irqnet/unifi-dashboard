import { NextResponse } from 'next/server';
import { canViewPage, findPage, getSession, visiblePages } from '@/lib/auth';
import { buildDashboard } from '@/lib/unifi/aggregate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * Data for a status page. Access: public page, admin, shared access or a user
 * account the page is assigned to. The response only contains the page's groups –
 * data of other networks/devices never leaves the server.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const page = findPage((await params).slug);
  const session = await getSession();
  // Unknown and forbidden pages are indistinguishable
  if (!page || !canViewPage(session, page)) {
    return apiError(session ? 'api.forbidden' : 'api.unauthenticated', session ? 403 : 401);
  }
  try {
    const pages = visiblePages(session).map((p) => ({ slug: p.slug, title: p.title }));
    const payload = await buildDashboard(page.site, false, { page, pages, loggedIn: !!session });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api] status page:', err);
    return apiError('api.statusPageFailed', 500);
  }
}
