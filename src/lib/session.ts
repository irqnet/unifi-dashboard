/**
 * Signierte Session-Cookies (JWT/HS256 via jose). Edge-kompatibel, wird
 * sowohl von middleware.ts als auch von Route Handlern verwendet.
 */
import { SignJWT, jwtVerify } from 'jose';
import { cookieSecure, getSessionSecret, getSessionTtlHours } from './env';

export const SESSION_COOKIE = 'ud_session';
/**
 * viewer = gemeinsamer Zugang (Gate/Zugangspasswort) mit Gesamtansicht,
 * user   = Benutzerkonto mit Zugriff nur auf zugewiesene Statusseiten,
 * admin  = Vollzugriff (Admin-Passwort oder Benutzerkonto mit Admin-Rolle).
 */
export type Role = 'viewer' | 'user' | 'admin';

export interface SessionPayload {
  role: Role;
  /** Benutzer-ID bei Anmeldung mit Benutzerkonto */
  uid?: number;
  /** Session-Version des Benutzers (ändert sich bei Passwortwechsel/Sperre) */
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
