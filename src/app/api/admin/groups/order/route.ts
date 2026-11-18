import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { listGroups, reorderGroups } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/** Reihenfolge der Gruppen auf dem Dashboard setzen: { site, ids: number[] } */
export async function PUT(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; ids?: unknown } | null;
  const site = await resolveSite(typeof body?.site === 'string' ? body.site : null);
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  if (!Array.isArray(body?.ids) || body!.ids.some((x) => !Number.isInteger(x))) {
    return NextResponse.json({ error: 'Ungültige Reihenfolge' }, { status: 400 });
  }
  reorderGroups(site, body!.ids as number[]);
  return NextResponse.json({ groups: listGroups(site) });
}
