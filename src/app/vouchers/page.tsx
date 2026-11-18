import { redirect } from 'next/navigation';
import { VoucherManager } from '@/components/vouchers/VoucherManager';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gäste-WLAN · Voucher' };

export default async function VouchersPage() {
  // Defense-in-Depth zusätzlich zur Middleware
  const session = await getSession();
  if (!session) redirect('/gate');
  if (session.role !== 'admin') redirect('/admin/login');
  return <VoucherManager />;
}
