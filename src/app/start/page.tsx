import { ChevronRight, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { AuthShell } from '@/components/ui/AuthShell';
import { getSession, visiblePages } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** Start page for user accounts: list of assigned status pages (exactly one → go straight there). */
export default async function StartPage() {
  const session = await getSession();
  if (!session) redirect('/gate');
  const pages = visiblePages(session);
  if (session.role === 'user' && pages.length === 1) redirect(`/s/${pages[0].slug}`);
  const t = await getT();

  return (
    <AuthShell
      title={t('start.title')}
      subtitle={pages.length ? t('start.choose') : t('start.noneAssigned')}
      footer={<LogoutButton className="inline-flex items-center gap-1.5 hover:text-noc-text" />}
    >
      {pages.length === 0 ? (
        <p className="text-sm text-noc-muted">{t('start.noneHint')}</p>
      ) : (
        <ul className="-my-1 divide-y divide-noc-line">
          {pages.map((p) => (
            <li key={p.id}>
              <Link href={`/s/${p.slug}`} className="flex items-center justify-between gap-3 py-2.5 text-sm text-noc-text hover:text-sky-300">
                <span>
                  <span className="font-medium">{p.title}</span>
                  {p.description && <span className="block text-xs text-noc-muted">{p.description}</span>}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-noc-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {session.role !== 'user' && (
        <Link href="/" className="mt-4 flex items-center gap-1.5 border-t border-noc-line pt-3 text-xs text-noc-muted hover:text-noc-text">
          <LayoutGrid className="h-3.5 w-3.5" /> {t('start.toOverview')}
        </Link>
      )}
    </AuthShell>
  );
}
