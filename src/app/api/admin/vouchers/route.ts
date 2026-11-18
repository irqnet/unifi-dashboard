import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getConfig } from '@/lib/env';
import { resolveSite } from '@/lib/site';
import { readJson } from '@/lib/validate';
import { createVouchers, getPresets, listVouchers, parseSpec, type VoucherSpec } from '@/lib/vouchers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const site = await resolveSite(new URL(req.url).searchParams.get('site'));
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });
  try {
    return NextResponse.json(await listVouchers(site), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Voucher konnten nicht geladen werden' }, { status: 502 });
  }
}

/** Body: { site, presetId? | minutes, quota, up?, down?, megabytes?, count, note } */
export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  const site = await resolveSite(typeof body.site === 'string' ? body.site : null);
  if (!site) return NextResponse.json({ error: 'Unbekannte Site' }, { status: 404 });

  const cfg = getConfig().vouchers;
  let spec: VoucherSpec;
  if (typeof body.presetId === 'string' && body.presetId) {
    const preset = getPresets().find((p) => p.id === body.presetId);
    if (!preset) return NextResponse.json({ error: 'Unbekannte Vorlage' }, { status: 400 });
    spec = preset;
  } else {
    const parsed = parseSpec(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    spec = parsed.value;
  }
  const count = Number(body.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > cfg.maxBatch) {
    return NextResponse.json({ error: `Anzahl muss zwischen 1 und ${cfg.maxBatch} liegen` }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
  if (cfg.noteRequired && !note) return NextResponse.json({ error: 'Bitte eine Notiz angeben' }, { status: 400 });

  try {
    const created = await createVouchers(site, { minutes: spec.minutes, quota: spec.quota, up: spec.up, down: spec.down, megabytes: spec.megabytes }, count, note);
    console.info(`[vouchers] ${count} Voucher für Site "${site}" erstellt (${spec.minutes} min, Quota ${spec.quota})`);
    return NextResponse.json({ created }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Voucher konnten nicht erstellt werden' }, { status: 502 });
  }
}
