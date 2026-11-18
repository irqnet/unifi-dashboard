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
import type { RawClient, RawDevice, RawHealth, RawNetwork, RawSite, SiteRawData, UniFiEnvelope } from './types';

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
    const json = (await res.json()) as UniFiEnvelope<T> | T[];
    if (Array.isArray(json)) return json;
    if (json.meta?.rc === 'error') throw new UniFiError(`UniFi-API ${path}: ${json.meta.msg ?? 'Fehler'}`);
    return json.data ?? [];
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
