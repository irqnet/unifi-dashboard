import 'server-only';
import { getPoller } from './unifi/poller';

/** Validates the ?site= parameter against the configured/discovered sites. */
export async function resolveSite(requested: string | null): Promise<string | null> {
  const poller = getPoller();
  await poller.ensureStarted();
  const sites = await poller.listSites();
  if (!requested) return sites[0]?.name ?? 'default';
  return sites.some((s) => s.name === requested) ? requested : null;
}
