import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { setWanProvider, setWanQuota } from '@/lib/db';
import { resolveSite } from '@/lib/site';
import { buildAdminWans } from '@/lib/unifi/aggregate';
import { readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

const MAX_PROVIDER = 60;
const MAX_QUOTA_GB = 1_000_000;

/** WAN connections with the detected provider and the manually set one. */
export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  return NextResponse.json({ site, ...(await buildAdminWans(site)) });
}

/**
 * Set the provider name of one WAN connection (empty string clears it) and/or its monthly
 * data allowance (quotaGb: number or null for no limit, cycleDay: 1–28).
 */
export async function PUT(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; key?: unknown; provider?: unknown; quotaGb?: unknown; cycleDay?: unknown } | null;
  if (!body || typeof body.site !== 'string' || typeof body.key !== 'string' || !/^WAN\d*$/i.test(body.key)) {
    return apiError('api.badRequest', 400);
  }
  if (body.provider !== null && body.provider !== undefined && typeof body.provider !== 'string') return apiError('api.badRequest', 400);
  const hasQuota = body.quotaGb !== undefined || body.cycleDay !== undefined;
  const quotaOk = body.quotaGb === undefined || body.quotaGb === null || (typeof body.quotaGb === 'number' && Number.isFinite(body.quotaGb) && body.quotaGb >= 0 && body.quotaGb <= MAX_QUOTA_GB);
  const dayOk = body.cycleDay === undefined || (Number.isInteger(body.cycleDay) && (body.cycleDay as number) >= 1 && (body.cycleDay as number) <= 28);
  if (!quotaOk || !dayOk) return apiError('api.badRequest', 400);
  const site = await resolveSite(body.site);
  if (!site) return apiError('api.unknownSite', 404);
  const key = body.key.toUpperCase();
  if (body.provider !== undefined) {
    const provider = typeof body.provider === 'string' ? body.provider.trim().slice(0, MAX_PROVIDER) : '';
    setWanProvider(site, key, provider || null);
  }
  if (hasQuota) {
    const quotaGb = typeof body.quotaGb === 'number' && body.quotaGb > 0 ? body.quotaGb : null;
    setWanQuota(site, key, { quotaGb, cycleDay: typeof body.cycleDay === 'number' ? body.cycleDay : 1 });
  }
  return NextResponse.json({ ok: true });
}
