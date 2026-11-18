import { NextResponse } from 'next/server';
import { hashPassword, requireRole } from '@/lib/auth';
import { createUser, findUserForLogin, listUsers } from '@/lib/db';
import { parseUserInput, readJson } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  return NextResponse.json({ users: listUsers(), currentUserId: auth.session.uid ?? null });
}

export async function POST(req: Request) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const parsed = parseUserInput(await readJson(req));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { password, ...rest } = parsed.value;
  if (findUserForLogin(rest.username!)) {
    return NextResponse.json({ error: 'Benutzername ist bereits vergeben' }, { status: 409 });
  }
  const user = createUser({ ...rest, username: rest.username!, passwordHash: await hashPassword(password!) });
  return NextResponse.json({ user }, { status: 201 });
}
