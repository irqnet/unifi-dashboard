import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getConfig } from '@/lib/env';
import { getT } from '@/lib/i18n/server';
import { resolveSite } from '@/lib/site';
import { readJson } from '@/lib/validate';
import { createVouchers, getPresets, listVouchers, parseSpec, type VoucherSpec } from '@/lib/vouchers';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return apiError('api.unknownSite', 404);
  try {
    return NextResponse.json(await listVouchers(site, await getT()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || (await getT())('api.vouchersLoadFailed') }, { status: 502 });
  }
}

/** Body: { site, presetId? | minutes, quota, up?, down?, megabytes?, count, note } */
export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return apiError('api.badRequest', 400);
  const site = await resolveSite(typeof body.site === 'string' ? body.site : null);
  if (!site) return apiError('api.unknownSite', 404);

  const cfg = getConfig().vouchers;
  let spec: VoucherSpec;
  if (typeof body.presetId === 'string' && body.presetId) {
    const preset = getPresets(await getT()).find((p) => p.id === body.presetId);
    if (!preset) return apiError('api.unknownPreset', 400);
    spec = preset;
  } else {
    const parsed = parseSpec(body, await getT());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    spec = parsed.value;
  }
  const count = Number(body.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > cfg.maxBatch) {
    return apiError('api.countRange', 400, { max: cfg.maxBatch });
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
  if (cfg.noteRequired && !note) return apiError('api.noteRequired', 400);

  try {
    const created = await createVouchers(site, { minutes: spec.minutes, quota: spec.quota, up: spec.up, down: spec.down, megabytes: spec.megabytes }, count, note);
    console.info(`[vouchers] Created ${count} voucher(s) for site "${site}" (${spec.minutes} min, quota ${spec.quota})`);
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || (await getT())('api.vouchersCreateFailed') }, { status: 502 });
  }
}
