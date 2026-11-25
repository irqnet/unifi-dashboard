import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { listWanProviders } from '@/lib/db';
import { wanHistory } from '@/lib/history';
import { apiError } from '@/lib/i18n/server';
import { resolveSite } from '@/lib/site';
import { getPoller } from '@/lib/unifi/poller';
import { wanKey, wanNetworks } from '@/lib/unifi/wan';

export const dynamic = 'force-dynamic';

/** Failover history of the last 30 days and the data volume per WAN in the current billing month. */
export async function GET(req: Request) {
  const auth = await requireRole('viewer');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  try {
    const poller = getPoller();
    await poller.ensureStarted();
    const nets = wanNetworks(poller.getState(site).data?.networks ?? []);
    const providers = listWanProviders(site);
    const links = nets.map((n) => ({ key: wanKey(n), name: n.name || wanKey(n), provider: providers.get(wanKey(n)) ?? null }));
    const keys = links.length ? links.map((l) => l.key) : ['WAN'];
    return NextResponse.json(
      { primary: keys[0], links, now: Date.now(), ...wanHistory(site, keys) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[api] wan-history:', err);
    return apiError('api.dashboardFailed', 500);
  }
}
