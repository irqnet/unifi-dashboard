/**
 * Flexibler UniFi-API-Client.
 *  - UniFi OS (UDM/UCG/Cloud Key Gen2+/UNVR): API-Key (X-API-KEY) oder Login via /api/auth/login,
 *    Pfad-Präfix /proxy/network, CSRF-Token aus Header x-csrf-token.
 *  - Klassischer Self-Hosted Controller: Login via /api/login, Cookie "unifises" + "csrf_token".
 * Self-Signed-Zertifikate werden über einen eigenen undici-Agent (UNIFI_VERIFY_SSL=false) unterstützt.
 */
import 'server-only';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { getConfig } from '../env';
import type { RawClient, RawDevice, RawGuest, RawHealth, RawNetwork, RawSite, RawVoucher, SiteRawData, UniFiEnvelope } from './types';

type Flavor = 'unifios' | 'classic';

export class UniFiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'UniFiError';
  }
}

/**
 * Robustes JSON-Parsing: Manche Controller-Firmwares liefern nicht-standardkonforme Zahlen
 * (NaN, Infinity, nan, inf) z. B. in Temperatur- oder Statistikfeldern. Diese werden zu null.
 */
export function parseUniFiJson<T>(text: string, path: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const sanitized = text.replace(/([:\[,]\s*)-?(?:NaN|nan|-nan|Infinity|inf|-inf)(?=\s*[,}\]])/g, '$1null');
    try {
      return JSON.parse(sanitized) as T;
    } catch (err) {
      const msg = (err as Error).message;
      const pos = Number(/position (\d+)/.exec(msg)?.[1] ?? NaN);
      const ctx = Number.isFinite(pos) ? sanitized.slice(Math.max(0, pos - 80), pos + 80).replace(/\s+/g, ' ') : '';
      console.error(`[unifi] Ungültiges JSON von ${path} (${text.length} Bytes): ${msg}${ctx ? `\n  Kontext: …${ctx}…` : ''}`);
      throw new UniFiError(`Ungültige Antwort von ${path}: ${msg}`);
    }
  }
}

export class UniFiClient {
  private dispatcher: Dispatcher;
  private flavor: Flavor | null = null;
  private cookies = new Map<string, string>();
  private csrfToken: string | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(private cfg = getConfig().unifi) {
    this.dispatcher = new Agent({
      connect: { rejectUnauthorized: cfg.verifySsl },
      keepAliveTimeout: 30_000,
    });
    if (cfg.controllerType === 'unifios' || cfg.controllerType === 'classic') {
      this.flavor = cfg.controllerType;
    } else if (cfg.apiKey) {
      this.flavor = 'unifios'; // API-Keys gibt es nur unter UniFi OS
    }
  }

  get usesApiKey() {
    return !!this.cfg.apiKey;
  }

  private prefix(): string {
    return this.flavor === 'classic' ? '' : '/proxy/network';
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private storeCookies(res: { headers: { getSetCookie?: () => string[]; get(name: string): string | null } }) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        this.cookies.set(name, value);
        if (name === 'csrf_token') this.csrfToken = value;
      }
    }
    const csrf = res.headers.get('x-csrf-token') ?? res.headers.get('x-updated-csrf-token');
    if (csrf) this.csrfToken = csrf;
  }

  private async raw(path: string, init: { method?: string; body?: unknown } = {}) {
    if (!this.cfg.url) throw new UniFiError('UNIFI_CONTROLLER_URL ist nicht gesetzt');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cfg.apiKey) headers['X-API-KEY'] = this.cfg.apiKey;
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    if (this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;
    const res = await undiciFetch(this.cfg.url + path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      dispatcher: this.dispatcher,
      signal: AbortSignal.timeout(this.cfg.requestTimeoutMs),
    });
    this.storeCookies(res);
    return res;
  }

  /** Erkennt UniFi OS vs. klassischen Controller und meldet sich per Benutzer/Passwort an. */
  private async login(): Promise<void> {
    if (this.cfg.apiKey) return;
    if (!this.cfg.username || !this.cfg.password) {
      throw new UniFiError('Weder UNIFI_API_KEY noch UNIFI_USERNAME/UNIFI_PASSWORD konfiguriert');
    }
    this.cookies.clear();
    this.csrfToken = null;
    const creds = { username: this.cfg.username, password: this.cfg.password, remember: true };

    const tryFlavor = async (flavor: Flavor) => {
      const res = await this.raw(flavor === 'unifios' ? '/api/auth/login' : '/api/login', {
        method: 'POST',
        body: creds,
      });
      await res.text().catch(() => '');
      return res;
    };

    if (this.flavor) {
      const res = await tryFlavor(this.flavor);
      if (!res.ok) throw new UniFiError(`UniFi-Login fehlgeschlagen (HTTP ${res.status})`, res.status);
      return;
    }
    // Auto-Erkennung: zuerst UniFi OS, dann klassischer Controller
    const os = await tryFlavor('unifios').catch(() => null);
    if (os?.ok) {
      this.flavor = 'unifios';
      return;
    }
    const classic = await tryFlavor('classic');
    if (classic.ok) {
      this.flavor = 'classic';
      return;
    }
    throw new UniFiError(`UniFi-Login fehlgeschlagen (HTTP ${classic.status})`, classic.status);
  }

  private async ensureLogin() {
    if (this.cfg.apiKey) return;
    if (this.cookies.size && this.flavor) return;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
  }

  /** GET auf einen Network-API-Pfad (ohne Präfix), automatischer Re-Login bei 401. */
  async get<T>(path: string, retry = true): Promise<T[]> {
    await this.ensureLogin();
    const res = await this.raw(this.prefix() + path);
    if ((res.status === 401 || res.status === 403) && retry && !this.cfg.apiKey) {
      await res.text().catch(() => '');
      this.cookies.clear();
      return this.get<T>(path, false);
    }
    if (!res.ok) {
      await res.text().catch(() => '');
      throw new UniFiError(`UniFi-API ${path}: HTTP ${res.status}`, res.status);
    }
    const json = parseUniFiJson<UniFiEnvelope<T> | T[]>(await res.text(), path);
    if (Array.isArray(json)) return json;
    if (json.meta?.rc === 'error') throw new UniFiError(`UniFi-API ${path}: ${json.meta.msg ?? 'Fehler'}`);
    return json.data ?? [];
  }

  /** POST auf einen Network-API-Pfad (z. B. cmd/hotspot), automatischer Re-Login bei 401. */
  async post<T>(path: string, body: unknown, retry = true): Promise<T[]> {
    await this.ensureLogin();
    const res = await this.raw(this.prefix() + path, { method: 'POST', body });
    if ((res.status === 401 || res.status === 403) && retry && !this.cfg.apiKey) {
      await res.text().catch(() => '');
      this.cookies.clear();
      return this.post<T>(path, body, false);
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      let msg = '';
      try {
        msg = (JSON.parse(text) as UniFiEnvelope<T>).meta?.msg ?? '';
      } catch {
        /* ignore */
      }
      const hint = res.status === 403 ? ' – hat der UniFi-Benutzer/API-Key Schreibrechte (Hotspot-Verwaltung)?' : '';
      throw new UniFiError(`UniFi-API ${path}: HTTP ${res.status}${msg ? ` (${msg})` : ''}${hint}`, res.status);
    }
    const json = parseUniFiJson<UniFiEnvelope<T> | T[]>(text || '{}', path);
    if (Array.isArray(json)) return json;
    if (json.meta?.rc === 'error') throw new UniFiError(`UniFi-API ${path}: ${json.meta.msg ?? 'Fehler'}`);
    return json.data ?? [];
  }

  vouchers(site: string) {
    return this.get<RawVoucher>(`/api/s/${encodeURIComponent(site)}/stat/voucher`);
  }

  guests(site: string, withinHours = 24 * 7) {
    return this.get<RawGuest>(`/api/s/${encodeURIComponent(site)}/stat/guest?within=${withinHours}`);
  }

  /** Erstellt Voucher; liefert die create_time, über die die neuen Codes gefunden werden. */
  createVouchers(
    site: string,
    opts: { count: number; minutes: number; quota: number; note?: string; up?: number; down?: number; megabytes?: number },
  ) {
    const body: Record<string, unknown> = {
      cmd: 'create-voucher',
      n: opts.count,
      quota: opts.quota,
      expire: opts.minutes,
      expire_number: opts.minutes,
      expire_unit: 1,
    };
    if (opts.note) body.note = opts.note;
    if (opts.up) body.up = opts.up;
    if (opts.down) body.down = opts.down;
    if (opts.megabytes) body.bytes = opts.megabytes;
    return this.post<{ create_time: number }>(`/api/s/${encodeURIComponent(site)}/cmd/hotspot`, body);
  }

  deleteVoucher(site: string, id: string) {
    return this.post(`/api/s/${encodeURIComponent(site)}/cmd/hotspot`, { cmd: 'delete-voucher', _id: id });
  }

  sites() {
    return this.get<RawSite>('/api/self/sites');
  }

  devices(site: string) {
    return this.get<RawDevice>(`/api/s/${encodeURIComponent(site)}/stat/device`);
  }

  clients(site: string) {
    return this.get<RawClient>(`/api/s/${encodeURIComponent(site)}/stat/sta`);
  }

  networks(site: string) {
    return this.get<RawNetwork>(`/api/s/${encodeURIComponent(site)}/rest/networkconf`);
  }

  health(site: string) {
    return this.get<RawHealth>(`/api/s/${encodeURIComponent(site)}/stat/health`);
  }

  async siteData(site: string): Promise<SiteRawData> {
    const [devices, clients, networks, health] = await Promise.all([
      this.devices(site),
      this.clients(site),
      this.networks(site),
      this.health(site),
    ]);
    return { devices, clients, networks, health };
  }
}
