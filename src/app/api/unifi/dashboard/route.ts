import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { resolveSite } from '@/lib/site';
import { buildDashboard } from '@/lib/unifi/aggregate';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireRole('viewer');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  try {
    const payload = await buildDashboard(site, auth.session.role === 'admin');
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api] dashboard:', err);
    return NextResponse.json({ error: 'Dashboard-Daten konnten nicht erstellt werden' }, { status: 500 });
  }
}
