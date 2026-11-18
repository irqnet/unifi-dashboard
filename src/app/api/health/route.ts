import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Öffentlicher Health-Check für Container-HEALTHCHECK – liefert keine sensiblen Daten. */
export async function GET() {
  return NextResponse.json({ status: 'ok', uptime: Math.round(process.uptime()) });
}
