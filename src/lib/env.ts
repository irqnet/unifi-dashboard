/**
 * Central server-side configuration from environment variables.
 * Values are read fresh on every call so a locally built image can be
 * configured via .env without a rebuild.
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
      /** Configured sites. "*" = discover all sites of the controller automatically. */
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
    /** Fallback bandwidth in Mbit/s when UniFi provides no expected ISP speeds */
    wanDownMbps: int('WAN_BANDWIDTH_DOWN_MBPS', 0),
    wanUpMbps: int('WAN_BANDWIDTH_UP_MBPS', 0),
    dataDir: str('DATA_DIR', './data'),
    vouchers: {
      /** Presets: "Name=minutes,uses,upload kbps,download kbps,MB;…" (name optional; without a name the label is generated in the UI language) */
      presets: str('VOUCHER_PRESETS', '1440,1,,,;4320,1,,,;10080,3,,,'),
      /** SSID of the guest Wi-Fi – appears on the printout and in the QR code */
      ssid: str('VOUCHER_WIFI_SSID'),
      /** WPA password of the guest Wi-Fi (empty = open network with hotspot portal) */
      wifiPassword: str('VOUCHER_WIFI_PASSWORD'),
      /** Note is required when creating */
      noteRequired: bool('VOUCHER_NOTE_REQUIRED', false),
      /** Maximum number of vouchers per create operation */
      maxBatch: int('VOUCHER_MAX_BATCH', 100, 1),
    },
  };
}

/** Also used in the edge middleware context – hence no Node APIs. */
export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long.');
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
  // Dynamic access prevents Next.js from inlining the NEXT_PUBLIC_ value at build time –
  // so configuration via .env works at runtime.
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
