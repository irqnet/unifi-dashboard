import { Dashboard } from '@/components/dashboard/Dashboard';
import { defaultRefreshMs } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

/** Second page: network hardware (switches & access points, device groups). */
export default function HardwarePage() {
  return <Dashboard defaultRefreshMs={defaultRefreshMs()} view="hardware" />;
}
