import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AuthShell } from '@/components/ui/AuthShell';
import { getSession } from '@/lib/auth';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const session = await getSession();
  if (!session) redirect('/gate');
  if (session.role === 'admin') redirect('/admin');
  const t = await getT();
  return (
    <AuthShell
      title={t('adminLogin.title')}
      subtitle={t('adminLogin.subtitle')}
      footer={
        <Link href="/" className="hover:text-noc-text">
          ← {t('adminLogin.back')}
        </Link>
      }
    >
      <AdminLoginForm />
    </AuthShell>
  );
}
