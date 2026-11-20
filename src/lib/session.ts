/**
 * Signed session cookies (JWT/HS256 via jose). Edge-compatible, used by
 * middleware.ts as well as by route handlers.
 */
import { SignJWT, jwtVerify } from 'jose';
import { cookieSecure, getSessionSecret, getSessionTtlHours } from './env';

export const SESSION_COOKIE = 'ud_session';
/**
 * viewer = shared access (gate/access password) with the full overview,
 * user   = user account with access to assigned status pages only,
 * admin  = full access (admin password or user account with the admin role).
 */
export type Role = 'viewer' | 'user' | 'admin';

export interface SessionPayload {
  role: Role;
  /** User ID when signed in with a user account */
  uid?: number;
  /** User's session version (changes on password change/disable) */
  sv?: number;
  iat?: number;
  exp?: number;
}

export async function createSessionToken(role: Role, user?: { id: number; sessionVersion: number }): Promise<string> {
  const ttl = getSessionTtlHours();
  return new SignJWT(user ? { role, uid: user.id, sv: user.sessionVersion } : { role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer('unifi-dashboard')
    .setAudience('unifi-dashboard')
    .setExpirationTime(`${ttl}h`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ['HS256'],
      issuer: 'unifi-dashboard',
      audience: 'unifi-dashboard',
    });
    const role = payload.role;
    if (role !== 'viewer' && role !== 'user' && role !== 'admin') return null;
    const uid = typeof payload.uid === 'number' ? payload.uid : undefined;
    const sv = typeof payload.sv === 'number' ? payload.sv : undefined;
    if (role === 'user' && uid === undefined) return null;
    return { role, uid, sv, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'strict' as const,
    path: '/',
    maxAge: getSessionTtlHours() * 3600,
  };
}
