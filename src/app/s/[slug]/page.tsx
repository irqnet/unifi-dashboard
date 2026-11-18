import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { GateScreen } from '@/components/gate/GateScreen';
import { AuthShell } from '@/components/ui/AuthShell';
import { canViewPage, findPage, getSession } from '@/lib/auth';
import { defaultRefreshMs } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

/** Statusseite: nur die zugewiesenen VLAN- und Geräte-Gruppen, optional öffentlich. */
export default async function StatusPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findPage(slug);
  const session = await getSession();

  if (page && canViewPage(session, page)) {
    return <Dashboard defaultRefreshMs={defaultRefreshMs()} view="status" endpoint={`/api/status/${page.slug}`} />;
  }
  // Ohne Login: Gate anzeigen (verrät nicht, ob es die Seite gibt)
  if (!session) return <GateScreen next={`/s/${slug}`} />;

  return (
    <AuthShell
      title="Kein Zugriff"
      subtitle="Diese Statusseite ist für dein Konto nicht freigegeben."
      footer={<LogoutButton label="Mit anderem Konto anmelden" className="inline-flex items-center gap-1.5 hover:text-noc-text" />}
    >
      <div className="flex items-start gap-3 text-sm text-noc-muted">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p>
          Zu deinen freigegebenen Seiten geht es über die{' '}
          <Link href="/start" className="text-sky-300 hover:underline">
            Übersicht
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  );
}
