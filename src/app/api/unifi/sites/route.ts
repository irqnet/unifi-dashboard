import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getPoller } from '@/lib/unifi/poller';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireRole('viewer');
  if ('error' in auth) return auth.error;
  const poller = getPoller();
  await poller.ensureStarted();
  const sites = await poller.listSites();
  return NextResponse.json({ sites: sites.map((s) => ({ name: s.name, desc: s.desc || s.name })) });
}
