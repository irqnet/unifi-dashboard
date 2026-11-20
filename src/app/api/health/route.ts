import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Public health check for the container HEALTHCHECK – returns no sensitive data. */
export async function GET() {
  return NextResponse.json({ status: 'ok', uptime: Math.round(process.uptime()) });
}
