import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { deleteGroup, updateGroup } from '@/lib/db';
import { parseGroupInput, readJson } from '@/lib/validate';

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
  const parsed = parseGroupInput(await readJson(req), true);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const group = updateGroup(id, parsed.value);
  if (!group) return NextResponse.json({ error: 'Gruppe nicht gefunden' }, { status: 404 });
  return NextResponse.json({ group });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole('admin');
  if ('error' in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });
  if (!deleteGroup(id)) return NextResponse.json({ error: 'Gruppe nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
