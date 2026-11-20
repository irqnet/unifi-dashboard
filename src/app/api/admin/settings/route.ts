import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { countActiveAdmins, getDbStatus, getSettings, updateSettings, type AppSettings } from '@/lib/db';
import { isLocale } from '@/lib/i18n/config';
import { readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

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
  for (const key of ['showUngrouped', 'showUngroupedDevices', 'allowSharedAccess'] as const) {
    if (body && typeof body[key] === 'boolean') patch[key] = body[key] as boolean;
  }
  if (isLocale(body?.defaultLanguage)) patch.defaultLanguage = body.defaultLanguage;
  if (!Object.keys(patch).length) return apiError('api.badRequest', 400);
  // Without shared access only user accounts get through the gate → at least one admin account required
  if (patch.allowSharedAccess === false && countActiveAdmins() === 0) {
    return apiError('api.needAdminAccount', 400);
  }
  return NextResponse.json({ settings: updateSettings(patch) });
}
