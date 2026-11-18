import { NextResponse } from 'next/server';
import { hashPassword, requireRole } from '@/lib/auth';
import { countActiveAdmins, deleteUser, findUserForLogin, getSettings, getUser, updateUser } from '@/lib/db';
import { parseUserInput, readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  const existing = getUser(id);
  if (!existing) return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 404 });
  const parsed = parseUserInput(await readJson(req), true);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { password, ...rest } = parsed.value;

  if (rest.username) {
    const other = findUserForLogin(rest.username);
    if (other && other.user.id !== id) return NextResponse.json({ error: 'Benutzername ist bereits vergeben' }, { status: 409 });
  }
  // Eigenes Konto nicht versehentlich aussperren
  if (auth.session.uid === id && (rest.isAdmin === false || rest.disabled === true)) {
    return NextResponse.json({ error: 'Das eigene Konto kann nicht herabgestuft oder gesperrt werden' }, { status: 400 });
  }
  const losesAdmin = existing.isAdmin && !existing.disabled && (rest.isAdmin === false || rest.disabled === true);
  if (losesAdmin && !getSettings().allowSharedAccess && countActiveAdmins() <= 1) {
    return NextResponse.json({ error: 'Das letzte aktive Admin-Konto wird benötigt, solange der gemeinsame Zugang aus ist' }, { status: 400 });
  }
  const user = updateUser(id, { ...rest, passwordHash: password ? await hashPassword(password) : undefined });
  return NextResponse.json({ user });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  if (auth.session.uid === id) return NextResponse.json({ error: 'Das eigene Konto kann nicht gelöscht werden' }, { status: 400 });
  const existing = getUser(id);
  if (existing?.isAdmin && !existing.disabled && !getSettings().allowSharedAccess && countActiveAdmins() <= 1) {
    return NextResponse.json({ error: 'Das letzte aktive Admin-Konto wird benötigt, solange der gemeinsame Zugang aus ist' }, { status: 400 });
  }
  if (!deleteUser(id)) return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
