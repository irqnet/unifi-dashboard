import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { GateScreen } from '@/components/gate/GateScreen';
import { AuthShell } from '@/components/ui/AuthShell';
import { canViewPage, findPage, getSession } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';
import { defaultRefreshMs } from '@/lib/refresh';

export const dynamic = 'force-dynamic';

/** Status page: only the assigned VLAN and device groups, optionally public. */
export default async function StatusPageRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findPage(slug);
  const session = await getSession();

  if (page && canViewPage(session, page)) {
    return <Dashboard defaultRefreshMs={defaultRefreshMs()} view="status" endpoint={`/api/status/${page.slug}`} />;
  }
  // Not signed in: show the gate (does not reveal whether the page exists)
  if (!session) return <GateScreen next={`/s/${slug}`} />;
  const t = await getT();

  return (
    <AuthShell
      title={t('statusPage.noAccess')}
      subtitle={t('statusPage.notAssigned')}
      footer={<LogoutButton label={t('statusPage.otherAccount')} className="inline-flex items-center gap-1.5 hover:text-noc-text" />}
    >
      <div className="flex items-start gap-3 text-sm text-noc-muted">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p>
          {t('statusPage.overviewBefore')}{' '}
          <Link href="/start" className="text-sky-300 hover:underline">
            {t('statusPage.overviewLink')}
          </Link>
          {t('statusPage.overviewAfter')}
        </p>
      </div>
    </AuthShell>
  );
}
