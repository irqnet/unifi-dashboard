import 'server-only';
import { getPoller } from './unifi/poller';

/** Validiert den ?site=-Parameter gegen die konfigurierten/erkannten Sites. */
export async function resolveSite(requested: string | null): Promise<string | null> {
  const poller = getPoller();
  await poller.ensureStarted();
  const sites = await poller.listSites();
  if (!requested) return sites[0]?.name ?? 'default';
  return sites.some((s) => s.name === requested) ? requested : null;
}
