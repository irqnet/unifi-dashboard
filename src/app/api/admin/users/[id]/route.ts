import { NextResponse } from 'next/server';
import { hashPassword, requireRole } from '@/lib/auth';
import { countActiveAdmins, deleteUser, findUserForLogin, getSettings, getUser, updateUser } from '@/lib/db';
import { parseUserInput, readJson } from '@/lib/validate';
import { apiError } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return apiError('api.badId', 400);
  const existing = getUser(id);
  if (!existing) return apiError('api.userNotFound', 404);
  const parsed = parseUserInput(await readJson(req), true);
  if ('error' in parsed) return apiError(parsed.error, 400);
  const { password, ...rest } = parsed.value;

  if (rest.username) {
    const other = findUserForLogin(rest.username);
    if (other && other.user.id !== id) return apiError('api.usernameTaken', 409);
  }
  // Don't accidentally lock out your own account
  if (auth.session.uid === id && (rest.isAdmin === false || rest.disabled === true)) {
    return apiError('api.cannotDemoteSelf', 400);
  }
  const losesAdmin = existing.isAdmin && !existing.disabled && (rest.isAdmin === false || rest.disabled === true);
  if (losesAdmin && !getSettings().allowSharedAccess && countActiveAdmins() <= 1) {
    return apiError('api.lastAdmin', 400);
  }
  const user = updateUser(id, { ...rest, passwordHash: password ? await hashPassword(password) : undefined });
  return NextResponse.json({ user });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return apiError('api.badId', 400);
  if (auth.session.uid === id) return apiError('api.cannotDeleteSelf', 400);
  const existing = getUser(id);
  if (existing?.isAdmin && !existing.disabled && !getSettings().allowSharedAccess && countActiveAdmins() <= 1) {
    return apiError('api.lastAdmin', 400);
  }
  if (!deleteUser(id)) return apiError('api.userNotFound', 404);
  return NextResponse.json({ ok: true });
}
