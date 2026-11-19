import { NextResponse } from 'next/server';
import { canViewPage, findPage, getSession } from '@/lib/auth';
import type { SessionPayload } from '@/lib/session';
import { DEFAULT_LAYOUT_OWNER, deleteLayout, getLayout, saveLayout } from '@/lib/db';
import { SCOPE_RE, parseLayout } from '@/lib/layout';
import { readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/**
 * Kachel-Layouts.
 * GET    ?scope=…            → { own, default, canSaveOwn, canSaveDefault }
 * PUT    { scope, layout, target: 'own' | 'default' }
 * DELETE ?scope=…&target=…   → eigenes Layout bzw. Standardlayout zurücksetzen
 *
 * Eigene Layouts gibt es nur mit Benutzerkonto; beim gemeinsamen Zugang speichert
 * der Browser lokal. Das Standardlayout für alle dürfen nur Admins ändern.
 */

async function access(scope: string | null): Promise<{ scope: string; session: SessionPayload | null } | { error: NextResponse }> {
  if (!scope || !SCOPE_RE.test(scope)) return { error: NextResponse.json({ error: 'Ungültiger Bereich' }, { status: 400 }) };
  const session = await getSession();
  if (scope.startsWith('status:')) {
    const page = findPage(scope.slice(7));
    if (!page || !canViewPage(session, page)) return { error: NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 }) };
  } else if (!session || session.role === 'user') {
    return { error: NextResponse.json({ error: 'Kein Zugriff' }, { status: session ? 403 : 401 }) };
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
  if (!layout) return NextResponse.json({ error: 'Ungültiges Layout' }, { status: 400 });
  if (body?.target === 'default') {
    if (a.session?.role !== 'admin') return NextResponse.json({ error: 'Admin-Rechte erforderlich' }, { status: 403 });
    saveLayout(DEFAULT_LAYOUT_OWNER, a.scope, layout);
  } else {
    const uid = owner(a.session);
    if (uid === null) return NextResponse.json({ error: 'Nur mit Benutzerkonto speicherbar' }, { status: 403 });
    saveLayout(uid, a.scope, layout);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  const a = await access(sp.get('scope'));
  if ('error' in a) return a.error;
  if (sp.get('target') === 'default') {
    if (a.session?.role !== 'admin') return NextResponse.json({ error: 'Admin-Rechte erforderlich' }, { status: 403 });
    deleteLayout(DEFAULT_LAYOUT_OWNER, a.scope);
  } else {
    const uid = owner(a.session);
    if (uid === null) return NextResponse.json({ error: 'Nur mit Benutzerkonto speicherbar' }, { status: 403 });
    deleteLayout(uid, a.scope);
  }
  return NextResponse.json({ ok: true });
}
