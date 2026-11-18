import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { resolveSite } from '@/lib/site';
import { readJson } from '@/lib/validate';
import { deleteVouchers } from '@/lib/vouchers';

export const dynamic = 'force-dynamic';

/** Widerruft (löscht) Voucher. Body: { site, ids: string[] } */
export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; ids?: unknown } | null;
  const site = await resolveSite(typeof body?.site === 'string' ? body.site : null);
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)) : [];
  if (!ids.length || ids.length > 500) return NextResponse.json({ error: 'Keine gültigen Voucher-IDs' }, { status: 400 });
  const result = await deleteVouchers(site, ids);
  if (!result.deleted && result.errors.length) return NextResponse.json({ error: result.errors[0] }, { status: 502 });
  console.info(`[vouchers] ${result.deleted} Voucher für Site "${site}" widerrufen`);
  return NextResponse.json(result);
}
