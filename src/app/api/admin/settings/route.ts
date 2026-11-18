import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getDbStatus, getSettings, updateSettings, type AppSettings } from '@/lib/db';
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
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const patch: Partial<AppSettings> = {};
  for (const key of ['showUngrouped', 'showUngroupedDevices'] as const) {
    if (body && typeof body[key] === 'boolean') patch[key] = body[key] as boolean;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  return NextResponse.json({ settings: updateSettings(patch) });
}
