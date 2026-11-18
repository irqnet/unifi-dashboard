import { Dashboard } from '@/components/dashboard/Dashboard';
import { REFRESH_OPTIONS } from '@/lib/constants';
import { getConfig } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const interval = getConfig().pollingIntervalMs;
  // Auf nächstgelegene UI-Option runden (5s / 15s / 30s)
  const def = REFRESH_OPTIONS.filter((o) => o.ms > 0).reduce((best, o) => (Math.abs(o.ms - interval) < Math.abs(best.ms - interval) ? o : best));
  return <Dashboard defaultRefreshMs={def.ms} />;
}
