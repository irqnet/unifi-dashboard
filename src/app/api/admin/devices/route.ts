import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { resolveSite } from '@/lib/site';
import { buildAdminDevices } from '@/lib/unifi/aggregate';

export const dynamic = 'force-dynamic';

/** Live-Switche und Access Points des Controllers inkl. Gruppenzuordnung. */
export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  return NextResponse.json({ site, ...(await buildAdminDevices(site)) });
}
