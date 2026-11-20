import { NextResponse } from 'next/server';
import { canViewPage, findPage, getSession } from '@/lib/auth';
import type { SessionPayload } from '@/lib/session';
import { DEFAULT_LAYOUT_OWNER, deleteLayout, getLayout, saveLayout } from '@/lib/db';
import { SCOPE_RE, parseLayout } from '@/lib/layout';
import { readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/**
 * Tile layouts.
 * GET    ?scope=…            → { own, default, canSaveOwn, canSaveDefault }
 * PUT    { scope, layout, target: 'own' | 'default' }
 * DELETE ?scope=…&target=…   → reset own layout or the default layout
 *
 * Own layouts require a user account; with shared access the browser stores the
 * layout locally. Only admins may change the default layout for everyone.
 */

async function access(scope: string | null): Promise<{ scope: string; session: SessionPayload | null } | { error: NextResponse }> {
  if (!scope || !SCOPE_RE.test(scope)) return { error: await apiError('api.badScope', 400) };
  const session = await getSession();
  if (scope.startsWith('status:')) {
    const page = findPage(scope.slice(7));
    if (!page || !canViewPage(session, page)) return { error: await apiError('api.forbidden', 403) };
  } else if (!session || session.role === 'user') {
    return { error: await apiError('api.forbidden', session ? 403 : 401) };
  }
  return { scope, session };
}

const owner = (s: SessionPayload | null) => (s?.uid !== undefined ? s.uid : null);

export async function GET(req: Request) {
  const a = await access(new URL(req.url).searchParams.get('scope'));
  if ('error' in a) return a.error;
  const uid = owner(a.session);
  return NextResponse.json({
    own: uid !== null ? getLayout(uid, a.scope) : null,
    default: getLayout(DEFAULT_LAYOUT_OWNER, a.scope),
    canSaveOwn: uid !== null,
    canSaveDefault: a.session?.role === 'admin',
  });
}

export async function PUT(req: Request) {
  const body = (await readJson(req)) as { scope?: unknown; layout?: unknown; target?: unknown } | null;
  const a = await access(typeof body?.scope === 'string' ? body.scope : null);
  if ('error' in a) return a.error;
  const layout = parseLayout(body?.layout);
  if (!layout) return apiError('api.badLayout', 400);
  if (body?.target === 'default') {
    if (a.session?.role !== 'admin') return apiError('api.adminRequired', 403);
    saveLayout(DEFAULT_LAYOUT_OWNER, a.scope, layout);
  } else {
    const uid = owner(a.session);
    if (uid === null) return apiError('api.accountRequired', 403);
    saveLayout(uid, a.scope, layout);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  const a = await access(sp.get('scope'));
  if ('error' in a) return a.error;
  if (sp.get('target') === 'default') {
    if (a.session?.role !== 'admin') return apiError('api.adminRequired', 403);
    deleteLayout(DEFAULT_LAYOUT_OWNER, a.scope);
  } else {
    const uid = owner(a.session);
    if (uid === null) return apiError('api.accountRequired', 403);
    deleteLayout(uid, a.scope);
  }
  return NextResponse.json({ ok: true });
}
