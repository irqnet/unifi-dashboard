import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getDbStatus, getSettings, updateSettings } from '@/lib/db';
import { readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  return NextResponse.json({ settings: getSettings(), db: getDbStatus() });
}

export async function PUT(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const body = (await readJson(req)) as { showUngrouped?: unknown } | null;
  if (!body || typeof body.showUngrouped !== 'boolean') {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }
  return NextResponse.json({ settings: updateSettings({ showUngrouped: body.showUngrouped }) });
}
