/**
 * Serverseitige Auth-Helfer (Node-Runtime): timing-safe Passwortvergleich,
 * Cloudflare-Turnstile-Verifikation, einfaches Rate-Limiting und Rollenprüfung
 * für Route Handler (Defense-in-Depth zusätzlich zur Middleware).
 */
import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuthConfig } from './env';
import { Role, SESSION_COOKIE, SessionPayload, verifySessionToken } from './session';

/** Vergleicht zwei Strings in konstanter Zeit (auch bei unterschiedlicher Länge). */
export function safeEqual(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b) && expected.length > 0;
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip')?.trim() ?? '';
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const { turnstileSecretKey } = getAuthConfig();
  if (!turnstileSecretKey || !token) return false;
  const body = new URLSearchParams({ secret: turnstileSecretKey, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] Verifikation fehlgeschlagen:', err);
    return false;
  }
}

// --- Rate-Limiting (In-Memory, pro IP) --------------------------------------
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; reset: number }>();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + WINDOW_MS });
    if (attempts.size > 5000) {
      attempts.forEach((v, k) => {
        if (v.reset < now) attempts.delete(k);
      });
    }
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export function clearRateLimit(key: string) {
  attempts.delete(key);
}

// --- Session-Helfer ------------------------------------------------------------
export async function getSession(): Promise<SessionPayload | null> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Gibt eine 401/403-Antwort zurück, wenn die Rolle nicht ausreicht, sonst null. */
export async function requireRole(role: Role): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 }) };
  }
  if (role === 'admin' && session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin-Rechte erforderlich' }, { status: 403 }) };
  }
  return { session };
}
