import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { resolveSite } from '@/lib/site';
import { readJson } from '@/lib/validate';
import { deleteVouchers } from '@/lib/vouchers';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

/** Revokes (deletes) vouchers. Body: { site, ids: string[] } */
export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { site?: unknown; ids?: unknown } | null;
  const site = await resolveSite(typeof body?.site === 'string' ? body.site : null);
  if (!site) return apiError('api.unknownSite', 404);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)) : [];
  if (!ids.length || ids.length > 500) return apiError('api.noVoucherIds', 400);
  const result = await deleteVouchers(site, ids);
  if (!result.deleted && result.errors.length) return NextResponse.json({ error: result.errors[0] }, { status: 502 });
  console.info(`[vouchers] Revoked ${result.deleted} voucher(s) for site "${site}"`);
  return NextResponse.json(result);
}
