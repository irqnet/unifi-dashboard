import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createStatusPage, getStatusPageBySlug, listStatusPages } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { parseStatusPageInput, readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

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
  if (!site) return apiError('api.unknownSite', 404);
  const parsed = parseStatusPageInput(body);
  if ('error' in parsed) return apiError(parsed.error, 400);
  if (getStatusPageBySlug(parsed.value.slug!)) {
    return apiError('api.slugTaken', 409);
  }
  const page = createStatusPage({ ...parsed.value, site, slug: parsed.value.slug!, title: parsed.value.title! });
  return NextResponse.json({ page }, { status: 201 });
}
