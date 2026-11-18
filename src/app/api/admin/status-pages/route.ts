import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createStatusPage, getStatusPageBySlug, listStatusPages } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { parseStatusPageInput, readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  return NextResponse.json({ pages: listStatusPages() });
}

export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const site = await resolveSite(typeof body?.site === 'string' ? body.site : null);
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  const parsed = parseStatusPageInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (getStatusPageBySlug(parsed.value.slug!)) {
    return NextResponse.json({ error: 'Diese Adresse ist bereits vergeben' }, { status: 409 });
  }
  const page = createStatusPage({ ...parsed.value, site, slug: parsed.value.slug!, title: parsed.value.title! });
  return NextResponse.json({ page }, { status: 201 });
}
