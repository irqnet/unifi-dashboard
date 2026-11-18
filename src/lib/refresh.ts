import 'server-only';
import { REFRESH_OPTIONS } from './constants';
import { getConfig } from './env';

/** Standard-Refresh der UI: nächstgelegene Option zu POLLING_INTERVAL_MS (5s / 15s / 30s). */
export function defaultRefreshMs(): number {
  const interval = getConfig().pollingIntervalMs;
  return REFRESH_OPTIONS.filter((o) => o.ms > 0).reduce((best, o) =>
    Math.abs(o.ms - interval) < Math.abs(best.ms - interval) ? o : best,
  ).ms;
}
