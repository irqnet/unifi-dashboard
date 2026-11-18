import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { AuthShell } from '@/components/ui/AuthShell';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const session = await getSession();
  if (!session) redirect('/gate');
  if (session.role === 'admin') redirect('/admin');
  return (
    <AuthShell
      title="Admin-Bereich"
      subtitle="Netzwerk- & VLAN-Gruppierung verwalten"
      footer={
        <Link href="/" className="hover:text-noc-text">
          ← Zurück zum Dashboard
        </Link>
      }
    >
      <AdminLoginForm />
    </AuthShell>
  );
}
