import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createDeviceGroup, listDeviceGroups, type DeviceGroupInput } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { parseDeviceGroupInput, readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  return NextResponse.json({ site, groups: listDeviceGroups(site) });
}

export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const site = await resolveSite(typeof body?.site === 'string' ? body.site : null);
  if (!site) return apiError('api.unknownSite', 404);
  const parsed = parseDeviceGroupInput(body);
  if ('error' in parsed) return apiError(parsed.error, 400);
  return NextResponse.json({ group: createDeviceGroup(site, parsed.value as DeviceGroupInput) }, { status: 201 });
}
