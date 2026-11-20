import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { upsertNetworkSetting } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { buildAdminNetworks } from '@/lib/unifi/aggregate';
import { readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** Live networks/VLANs from /rest/networkconf incl. stored visibility/privacy options. */
export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  return NextResponse.json({ site, ...(await buildAdminNetworks(site)) });
}

/** Set visibility / anonymisation of a single network. */
export async function PUT(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; networkId?: unknown; hidden?: unknown; anonymizeClients?: unknown } | null;
  if (!body || typeof body.networkId !== 'string' || typeof body.site !== 'string') {
    return apiError('api.badRequest', 400);
  }
  const site = await resolveSite(body.site);
  if (!site) return apiError('api.unknownSite', 404);
  upsertNetworkSetting({
    site,
    networkId: body.networkId,
    hidden: !!body.hidden,
    anonymizeClients: !!body.anonymizeClients,
  });
  return NextResponse.json({ ok: true });
}
