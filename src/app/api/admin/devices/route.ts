import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { resolveSite } from '@/lib/site';
import { buildAdminDevices } from '@/lib/unifi/aggregate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** Live switches and access points of the controller incl. group assignment. */
export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  return NextResponse.json({ site, ...(await buildAdminDevices(site)) });
}
