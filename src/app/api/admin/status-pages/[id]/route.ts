import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { deleteStatusPage, getStatusPageBySlug, updateStatusPage } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { parseStatusPageInput, readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const parsed = parseStatusPageInput(body, true);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  let site: string | undefined;
  if (typeof body?.site === 'string') {
    site = (await resolveSite(body.site)) ?? undefined;
    if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  }
  if (parsed.value.slug) {
    const other = getStatusPageBySlug(parsed.value.slug);
    if (other && other.id !== id) return NextResponse.json({ error: 'Diese Adresse ist bereits vergeben' }, { status: 409 });
  }
  const page = updateStatusPage(id, { ...parsed.value, site });
  if (!page) return NextResponse.json({ error: 'Statusseite nicht gefunden' }, { status: 404 });
  return NextResponse.json({ page });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  if (!deleteStatusPage(id)) return NextResponse.json({ error: 'Statusseite nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
