/**
 * Signierte Session-Cookies (JWT/HS256 via jose). Edge-kompatibel, wird
 * sowohl von middleware.ts als auch von Route Handlern verwendet.
 */
import { SignJWT, jwtVerify } from 'jose';
import { cookieSecure, getSessionSecret, getSessionTtlHours } from './env';

export const SESSION_COOKIE = 'ud_session';
export type Role = 'viewer' | 'admin';

export interface SessionPayload {
  role: Role;
  iat?: number;
  exp?: number;
}

export async function createSessionToken(role: Role): Promise<string> {
  const ttl = getSessionTtlHours();
  return new SignJWT({ role })
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
    if (role !== 'viewer' && role !== 'admin') return null;
    return { role, iat: payload.iat, exp: payload.exp };
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
