/**
 * Zentrale, serverseitige Konfiguration aus Umgebungsvariablen.
 * Werte werden bei jedem Aufruf frisch gelesen, damit ein lokal gebautes
 * Image ohne Rebuild über die .env konfiguriert werden kann.
 */

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v).trim();
}

function bool(name: string, fallback: boolean): boolean {
  const v = str(name);
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function int(name: string, fallback: number, min = 0): number {
  const n = Number.parseInt(str(name), 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export function getConfig() {
  const sites = str('UNIFI_SITE_ID', 'default')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    unifi: {
      url: str('UNIFI_CONTROLLER_URL').replace(/\/+$/, ''),
      /** Konfigurierte Sites. "*" = alle Sites des Controllers automatisch erkennen. */
      sites: sites.length ? sites : ['default'],
      apiKey: str('UNIFI_API_KEY'),
      username: str('UNIFI_USERNAME'),
      password: str('UNIFI_PASSWORD'),
      /** auto | unifios | classic */
      controllerType: str('UNIFI_CONTROLLER_TYPE', 'auto').toLowerCase(),
      verifySsl: bool('UNIFI_VERIFY_SSL', true),
      mock: bool('UNIFI_MOCK', false),
      requestTimeoutMs: int('UNIFI_TIMEOUT_MS', 15000, 1000),
    },
    pollingIntervalMs: int('POLLING_INTERVAL_MS', 5000, 1000),
    historyMinutes: int('HISTORY_MINUTES', 30, 5),
    hideSensitiveIps: bool('HIDE_SENSITIVE_IPS', true),
    /** Gebuchte WAN-Bandbreite in Mbit/s (0 = aus Speedtest bzw. Verlauf ableiten) */
    wanDownMbps: int('WAN_BANDWIDTH_DOWN_MBPS', 0),
    wanUpMbps: int('WAN_BANDWIDTH_UP_MBPS', 0),
    dataDir: str('DATA_DIR', './data'),
  };
}

/** Wird auch im Edge-Middleware-Kontext verwendet – daher keine Node-APIs. */
export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET muss mindestens 32 Zeichen lang sein.');
  }
  return new TextEncoder().encode(secret);
}

export function getSessionTtlHours(): number {
  const n = Number.parseInt(process.env.SESSION_TTL_HOURS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

export function cookieSecure(): boolean {
  const v = (process.env.COOKIE_SECURE ?? 'true').toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(v);
}

export function getAuthConfig() {
  // Dynamischer Zugriff verhindert, dass Next.js den NEXT_PUBLIC_-Wert zur Build-Zeit
  // einbettet – so funktioniert die Konfiguration über die .env zur Laufzeit.
  const pubKey = 'NEXT_PUBLIC_' + 'TURNSTILE_SITE_KEY';
  return {
    accessPassword: process.env.ACCESS_PASSWORD ?? '',
    adminPassword: process.env.ADMIN_PASSWORD ?? '',
    turnstileEnabled: ['1', 'true', 'yes', 'on'].includes(
      (process.env.TURNSTILE_ENABLED ?? 'false').toLowerCase(),
    ),
    turnstileSiteKey: process.env[pubKey] ?? process.env.TURNSTILE_SITE_KEY ?? '',
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
  };
}
