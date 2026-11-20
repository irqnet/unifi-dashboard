/**
 * Server-side auth helpers (Node runtime): timing-safe password comparison,
 * Cloudflare Turnstile verification, simple rate limiting and role checks
 * for route handlers (defense in depth on top of the middleware).
 */
import 'server-only';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSettings, getStatusPageBySlug, getUser, listStatusPages, listStatusPagesForUser, type StatusPage } from './db';
import { getAuthConfig } from './env';
import { SESSION_COOKIE, SessionPayload, verifySessionToken } from './session';
import { apiError } from '@/lib/i18n/server';

/** Compares two strings in constant time (also for different lengths). */
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
    console.error('[turnstile] Verification failed:', err);
    return false;
  }
}

// --- Rate limiting (in-memory, per IP) --------------------------------------
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

// --- Password hashing (scrypt) ---------------------------------------------------
type ScryptOpts = { N: number; r: number; p: number; maxmem: number };
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: ScryptOpts) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, { ...SCRYPT, maxmem: MAXMEM });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map((x) => Number.parseInt(x, 10));
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  try {
    const actual = await scrypt(password, salt, expected.length, { N, r, p, maxmem: MAXMEM });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Dummy hash so that unknown usernames take as long as wrong passwords. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}

// --- Session helpers------------------------------------------------------------
/**
 * Reads and validates the session. User accounts are additionally checked against the DB
 * (deleted, disabled, password/role changed → session invalid).
 * Shared access (viewer) becomes invalid as soon as it is switched off in the admin area.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const s = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  if (s.uid !== undefined) {
    const user = getUser(s.uid);
    if (!user || user.disabled || user.sessionVersion !== s.sv) return null;
    if (s.role === 'admin' && !user.isAdmin) return { ...s, role: 'user' };
    return s;
  }
  if (s.role === 'viewer' && !getSettings().allowSharedAccess) return null;
  return s;
}

/** Checks whether a status page may be shown. */
export function canViewPage(session: SessionPayload | null, page: StatusPage): boolean {
  if (page.isPublic) return true;
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'viewer') return true;
  return session.uid !== undefined && listStatusPagesForUser(session.uid).some((p) => p.id === page.id);
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function findPage(slug: string): StatusPage | null {
  return SLUG_RE.test(slug) ? getStatusPageBySlug(slug) : null;
}

/**
 * Returns a 401/403 response if the role is insufficient.
 * "viewer" = full overview (shared access or admin); user accounts without the
 * admin role have no access to it.
 */
export async function requireRole(role: 'viewer' | 'admin'): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { error: await apiError('api.unauthenticated', 401) };
  }
  if (role === 'admin' && session.role !== 'admin') {
    return { error: await apiError('api.adminRequired', 403) };
  }
  if (role === 'viewer' && session.role === 'user') {
    return { error: await apiError('api.noOverviewAccess', 403) };
  }
  return { session };
}

/** Status pages a session may see (admin/shared access: all). */
export function visiblePages(session: SessionPayload | null): StatusPage[] {
  if (!session) return [];
  if (session.role === 'user') return session.uid !== undefined ? listStatusPagesForUser(session.uid) : [];
  return listStatusPages();
}
