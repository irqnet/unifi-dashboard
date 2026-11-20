import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Voucher management lives in the admin area; old links and bookmarks redirect there. */
export default function VouchersPage() {
  redirect('/admin?section=vouchers');
}
