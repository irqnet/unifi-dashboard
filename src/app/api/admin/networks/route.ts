import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { upsertNetworkSetting } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { buildAdminNetworks } from '@/lib/unifi/aggregate';
import { readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

/** Live-Netzwerke/VLANs aus /rest/networkconf inkl. gespeicherter Sichtbarkeits-/Datenschutzoptionen. */
export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  return NextResponse.json({ site, ...(await buildAdminNetworks(site)) });
}

/** Sichtbarkeit / Anonymisierung eines einzelnen Netzwerks setzen. */
export async function PUT(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; networkId?: unknown; hidden?: unknown; anonymizeClients?: unknown } | null;
  if (!body || typeof body.networkId !== 'string' || typeof body.site !== 'string') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  const site = await resolveSite(body.site);
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  upsertNetworkSetting({
    site,
    networkId: body.networkId,
    hidden: !!body.hidden,
    anonymizeClients: !!body.anonymizeClients,
  });
  return NextResponse.json({ ok: true });
}
