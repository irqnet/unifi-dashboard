import { redirect } from 'next/navigation';
import { GateScreen } from '@/components/gate/GateScreen';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  // Only allow relative, internal paths (no open redirect)
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNext((await searchParams).next);
  if (await getSession()) redirect(next);
  return <GateScreen next={next} />;
}
