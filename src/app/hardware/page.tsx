import { Dashboard } from '@/components/dashboard/Dashboard';
import { defaultRefreshMs } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

/** Zweite Seite: Netzwerk-Hardware (Switche & Access Points, Geräte-Gruppen). */
export default function HardwarePage() {
  return <Dashboard defaultRefreshMs={defaultRefreshMs()} view="hardware" />;
}
