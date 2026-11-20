import { redirect } from 'next/navigation';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  // Defense in depth on top of the middleware
  const session = await getSession();
  if (!session) redirect('/gate');
  if (session.role !== 'admin') redirect('/admin/login');
  return <AdminPanel />;
}
