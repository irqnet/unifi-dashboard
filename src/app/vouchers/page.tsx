import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Die Voucher-Verwaltung lebt im Admin-Bereich; alte Links und Lesezeichen leiten dorthin. */
export default function VouchersPage() {
  redirect('/admin?bereich=voucher');
}
