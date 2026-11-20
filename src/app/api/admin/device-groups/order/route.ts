import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { listDeviceGroups, reorderDeviceGroups } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function PUT(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; ids?: unknown } | null;
  const site = await resolveSite(typeof body?.site === 'string' ? body.site : null);
  if (!site) return apiError('api.unknownSite', 404);
  if (!Array.isArray(body?.ids) || body!.ids.some((x) => !Number.isInteger(x))) {
    return apiError('api.badOrder', 400);
  }
  reorderDeviceGroups(site, body!.ids as number[]);
  return NextResponse.json({ groups: listDeviceGroups(site) });
}
