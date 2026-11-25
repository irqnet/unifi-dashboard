import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { listGroups, listNetworkSettings } from '@/lib/db';
import { HISTORY_RANGES, trafficHistory, type HistoryRange } from '@/lib/history';
import { apiError } from '@/lib/i18n/server';
import { resolveSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Traffic history per VLAN group (main dashboard): ?range=1|6|24|168 hours. */
export async function GET(req: Request) {
  const auth = await requireRole('viewer');
  if ('error' in auth) return auth.error;
  const params = new URL(req.url).searchParams;
  const site = await resolveSite(params.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  const range = Number(params.get('range') ?? 24);
  if (!(range in HISTORY_RANGES)) return apiError('api.badRequest', 400);
  const netSettings = listNetworkSettings(site);
  const groups = listGroups(site)
    .filter((g) => !g.hidden)
    .map((g) => ({ id: String(g.id), networkIds: g.networkIds.filter((id) => !netSettings.get(id)?.hidden) }));
  try {
    return NextResponse.json(trafficHistory(site, range as HistoryRange, groups), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api] history:', err);
    return apiError('api.dashboardFailed', 500);
  }
}
