import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { setWanProvider } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { buildAdminWans } from '@/lib/unifi/aggregate';
import { readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

const MAX_PROVIDER = 60;

/** WAN connections with the detected provider and the manually set one. */
export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  return NextResponse.json({ site, ...(await buildAdminWans(site)) });
}

/** Set (or clear with an empty string) the provider name of one WAN connection. */
export async function PUT(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; key?: unknown; provider?: unknown } | null;
  if (!body || typeof body.site !== 'string' || typeof body.key !== 'string' || !/^WAN\d*$/i.test(body.key)) {
    return apiError('api.badRequest', 400);
  }
  if (body.provider !== null && body.provider !== undefined && typeof body.provider !== 'string') return apiError('api.badRequest', 400);
  const site = await resolveSite(body.site);
  if (!site) return apiError('api.unknownSite', 404);
  const provider = typeof body.provider === 'string' ? body.provider.trim().slice(0, MAX_PROVIDER) : '';
  setWanProvider(site, body.key.toUpperCase(), provider || null);
  return NextResponse.json({ ok: true });
}
