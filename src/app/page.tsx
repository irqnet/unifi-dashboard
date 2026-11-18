import { Dashboard } from '@/components/dashboard/Dashboard';
import { defaultRefreshMs } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return <Dashboard defaultRefreshMs={defaultRefreshMs()} view="network" />;
}
