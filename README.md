# UniFi Network Status & Monitoring Dashboard

Real-time NOC-style status page for UniFi networks, available in **English and German**. The **Networks** page (`/`) shows WAN throughput with utilisation gauges against the "Expected ISP Speeds" configured in UniFi for the active WAN (failover included), a breakdown of the total WAN throughput by VLAN group (switchable between Mbit/s and percent) and consolidated VLAN groups with live traffic history. The **Hardware** page (`/hardware`) shows switches with a port matrix and access points, organised by device groups. It also provides voucher management for guest wifi access. Access is protected by a combined **password & Cloudflare Turnstile gate** and a separate **admin area** for grouping networks/VLANs.

- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Lucide · Recharts · SQLite (`better-sqlite3`) · `jose` (JWT)
- **Operation:** locally built container image with Podman / `podman-compose` (no registry build, no GitHub Actions)

---

## Architecture

```
Browser ──► middleware.ts (checks the JWT cookie: viewer / admin)
   │
   ├─ /gate ─────────────── Access gate (ACCESS_PASSWORD + Turnstile) ─► POST /api/auth/verify
   ├─ / ─────────────────── Dashboard (client) ── polls ──► GET /api/unifi/dashboard?site=…
   └─ /admin ────────────── Admin UI ─────────────────────► /api/admin/{groups,networks,settings}
                                                                     │
   Next.js route handlers (BFF, Node runtime) ◄──────────────────────┘
     ├─ lib/unifi/client.ts     UniFi API client (API key or login + CSRF, self-signed TLS)
     ├─ lib/unifi/poller.ts     Background poller per site + in-memory ring buffer (history)
     ├─ lib/unifi/aggregate.ts  Group aggregation, privacy, hardware normalisation
     ├─ lib/i18n/               Translations (English / German) and language detection
     └─ lib/db.ts               SQLite: groups, network options, settings (/app/data/dashboard.db)
```

- **Backend for frontend:** The browser never talks to the controller directly. Credentials stay on the server; CORS and self-signed certificates (`UNIFI_VERIFY_SSL=false`) are handled in the BFF.
- **Poller & ring buffer:** Each site is polled every `POLLING_INTERVAL_MS`; every sample stores downstream/upstream and client count per network as well as the WAN throughput. The buffer keeps the last `HISTORY_MINUTES` (default 30). Group histories are computed by summing the contained VLANs. The history is deliberately volatile (lost on restart).
- **UniFi endpoints:** `stat/device`, `stat/sta`, `rest/networkconf` (cached for 60 s), `stat/health`, `self/sites`. Prefix `/proxy/network` for UniFi OS, no prefix for classic controllers.
- **Client-to-VLAN mapping:** `network_id` → network name → subnet match of the client IP.
- **Traffic direction:** `tx_bytes-r` (or `wired-tx_bytes-r`) from the infrastructure's point of view = **download** to the client, `rx_bytes-r` = **upload**.

## Languages

The whole interface (dashboard, hardware, status pages, gate and login, admin area, voucher printout) is available in English and German. English is the default.

- **Switching:** language switcher in the header menu and on the gate/login pages. The voucher printout has its own language selector, so guests can get a German or English voucher regardless of the admin's language.
- **Detection order:** saved choice (cookie `ud_lang`; for user accounts also stored in the database and applied on every device) → browser language (`Accept-Language`) → instance default.
- **Instance default:** *Admin → General → Language* (English unless changed).
- **Formats:** English uses `en-GB` (24-hour clock, day/month order), German uses `de-DE`.
- **Adding or changing text:** messages live in `src/lib/i18n/messages/*.ts`, one file per area with the English and German dictionaries side by side. English is the source of truth; the German dictionary is typed against it, so a missing translation fails `npm run typecheck`. Placeholders use `{name}`; plurals use `singular|plural` with a `count` parameter.

## Security: two-level access

| Area | Required role | Without permission |
|---|---|---|
| `/gate`, `/api/auth/verify`, `/api/health`, `/api/locale` | – (public) | – |
| `/`, `/hardware`, `/api/unifi/*` | `viewer` or `admin` | gate page or `401`; role `user` → own status pages |
| `/s/<address>`, `/api/status/<address>` | page marked public, `viewer`, `admin` or `user` with assignment | gate page or `401/403` |
| `/admin/login`, `/api/auth/admin` | valid session | gate page or `401` |
| `/admin`, `/vouchers`, `/api/admin/*` (GET/POST/PUT/DELETE) | `admin` | admin login or `401/403` |

1. **Access gate:** Requires `ACCESS_PASSWORD` (if set) and/or Cloudflare Turnstile (`TURNSTILE_ENABLED=true`). The password is compared with `crypto.timingSafeEqual` (over SHA-256 digests, independent of length); the Turnstile token is verified server-side against `https://challenges.cloudflare.com/turnstile/v0/siteverify`, including the client IP from `CF-Connecting-IP` / `X-Forwarded-For`. Success ⇒ signed JWT cookie `ud_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, `role: "viewer"`).
2. **Admin:** The gear icon in the header ⇒ `/admin/login` ⇒ `ADMIN_PASSWORD` (also timing-safe) upgrades the JWT to `role: "admin"`. "Leave admin mode" downgrades back to `viewer`.
3. **Defence in depth:** In addition to the middleware, every route handler checks the role again. Login endpoints are rate-limited per IP (10 attempts / 5 min).
4. **User accounts:** Users created in the admin area sign in at the gate with username + password (scrypt hash in SQLite). Role **Admin** = full access, role **Viewer** (`user`) = only the assigned status pages; the API only returns their groups, enforced on the server. Changing the password, locking, changing the role or deleting ends running sessions immediately. Optionally, shared access (gate without an account, role `viewer`) can be switched off.
5. **Privacy:** `HIDE_SENSITIVE_IPS=true` masks the WAN IP and client MACs for non-admins. Clients can be anonymised and networks hidden per network/group.

> If `SESSION_SECRET` (≥ 32 characters) is missing, or Turnstile is enabled but incompletely configured, the gate shows a configuration error instead of opening.

## Setting up Cloudflare Turnstile

1. Cloudflare dashboard → **Turnstile** → *Add widget*.
2. Enter the hostname(s) the dashboard is reachable at (e.g. `status.example.com`; add `localhost` for local tests).
3. Choose widget mode *Managed*.
4. **Site key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, **secret key** → `TURNSTILE_SECRET_KEY`, `TURNSTILE_ENABLED=true`.

The site key is read from `.env` at **runtime**, so no rebuild is needed after changing it.
For tests without real keys, Cloudflare provides dummy keys (site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).

**Password options:**
- Turnstile only: leave `ACCESS_PASSWORD=` empty, `TURNSTILE_ENABLED=true`
- Password only: `ACCESS_PASSWORD=…`, `TURNSTILE_ENABLED=false`
- Both (recommended for external access): set both

## UniFi access

**Recommended – API key (UniFi OS):** UniFi Network → *Settings → Control Plane → Integrations* → create an API key → `UNIFI_API_KEY`.

**Alternative – local user:** Create a local read-only admin and set `UNIFI_USERNAME` / `UNIFI_PASSWORD`. `UNIFI_CONTROLLER_TYPE=auto` tries UniFi OS first (`/api/auth/login`, CSRF from `x-csrf-token`), then the classic controller (`/api/login`, cookie `unifises` + `csrf_token`). When the session expires, it signs in again automatically.

**Multi-site:** `UNIFI_SITE_ID=default,branch` or `UNIFI_SITE_ID=*` (all sites of the controller). Selected in the header drop-down.

**Demo without a controller:** `UNIFI_MOCK=true` provides simulated data (2 sites, switches, APs, VLANs).

## Admin guide (`/admin`)

The admin area is laid out like macOS System Settings: a sidebar on the left with the **site** and the sections *Networks*, *Devices*, *Status pages*, *Users*, *Vouchers* and *General* (a list navigation on phones). The address remembers the section (`/admin?section=devices`; old German links such as `?bereich=geraete` still work). Groups, pages and accounts are edited in their own sheet (Cancel / Save, Delete at the bottom).

1. In the dashboard, click the **gear icon** at the top right and sign in with `ADMIN_PASSWORD`.
2. Choose the **site** at the top of the sidebar; networks/VLANs are loaded live from `rest/networkconf`.
3. **Networks → + Group** (e.g. "Guests & neighbours"): pick a colour and tick any number of networks. A network belongs to at most one group; assigning it to a new group moves it out of the old one.
4. **Display** per group:
   - *Combined:* one card with summed clients (LAN/Wi-Fi), combined traffic and a shared history chart. A click opens the drill-down with a VLAN breakdown and top clients.
   - *Individual per VLAN:* a group heading with totals, followed by one card per VLAN.
5. **Change order** (link above the group list) sets the order on the dashboard.
6. **Privacy:** *Anonymise host names* replaces host name/IP/MAC of the clients (e.g. guest VLAN) with "Client n". Turning off *Show on the dashboard* hides the group.
7. **All networks:** hide (*Show*) or anonymise (*Anonymous*) individual VLANs; *Show networks without a group* controls whether ungrouped networks appear as individual cards.
8. **Devices:** combine switches and APs (name · model · MAC, with search) into groups such as "Basement rack" or "Outdoor". Devices are assigned by MAC address, so the assignment survives renaming. Groups can be sorted and hidden; ungrouped devices appear as "More switches" / "More access points" (can be switched off).
9. **General:** controller and database health, reload data, interface language and default language for visitors, "Leave admin mode" and sign out.

All settings are stored in `data/dashboard.db` (SQLite, WAL mode). If the directory is not writable, the dashboard keeps running with an in-memory database; the admin area shows a warning and the log names the path and UID.

## Status pages & users

Under **Status pages** in the admin area you create pages with their own address (`/s/building-a`) and choose VLAN groups, device groups and optionally the WAN throughput for them. Groups hidden on the main dashboard can still appear on a status page. A page can be made **public** (no login and no Turnstile, e.g. for a wall display; MACs and WAN IP stay masked).

Under **Users** you create accounts and share one or more status pages with them. After signing in, a viewer lands directly on their page (or on an overview at `/start` if they have several). Vouchers, the full hardware view and admin remain locked.

## Guest Wi-Fi vouchers (Admin → Vouchers)

Issue UniFi hotspot vouchers directly in the dashboard. Functionally modelled on [glenndehaan/unifi-voucher-site](https://github.com/glenndehaan/unifi-voucher-site) (MIT licence, © Glenn de Haan), re-implemented natively here. Admins only, in the admin area under **Vouchers** (the "Vouchers" tab in the dashboard header leads there; old links to `/vouchers` are redirected).

- **Create:** presets from `VOUCHER_PRESETS` or custom (validity, single use / n devices / unlimited, download/upload limit, data volume), count (batch) and note. The new codes are shown immediately (click = copy).
- **List:** state (unused / active / expired), usage, limits, note, connected guest devices (`stat/guest`), expiry; filter and search by code, note or device.
- **Revoke:** individually, by multi-select or "Remove expired".
- **Print:** `/vouchers/print` as an A4 card sheet or 80 mm receipt (thermal printer), with a Wi-Fi QR code (`VOUCHER_WIFI_SSID`, optionally `VOUCHER_WIFI_PASSWORD`) and a language selector (English / German). "Save as PDF" in the print dialog replaces sending a PDF by email.
- **Endpoints:** `POST cmd/hotspot` (`create-voucher`, `delete-voucher`), `GET stat/voucher`, `GET stat/guest`.

> **Important:** Creating/deleting needs write access. A read-only user or read-only API key can only view vouchers. Use a user with hotspot/site admin rights for vouchers.

## Local deployment with Podman

Requirements: Podman ≥ 4.3 and `podman-compose` (or `podman compose`).

```bash
git clone https://github.com/irqnet/unifi-dashboard.git
cd unifi-dashboard

cp .env.example .env
# Generate a secret and put it into .env:
openssl rand -base64 48
nano .env

mkdir -p data
podman-compose up -d --build        # or: podman compose up -d --build
podman-compose logs -f
```

The dashboard is then reachable at **`http://<host>:3004`** (port mapping `3004:3000` in `compose.yaml`).

**Important – HTTPS & cookies:** The session cookie is `Secure` by default and browsers only store it over HTTPS (or `localhost`). For external access, put the dashboard behind a TLS reverse proxy or Cloudflare Tunnel (target `http://<host>:3004`). Only for a quick LAN test via `http://IP:3004`, temporarily set `COOKIE_SECURE=false`.

**Container details**
- Multi-stage build on `node:20-alpine`; `python3`, `make`, `g++` only in the build stage for `better-sqlite3`.
- Runs as the non-root user `node` (UID 1000), `read_only: true` with `tmpfs` for `/tmp` and `/app/.next/cache`, `cap_drop: ALL`, `no-new-privileges`.
- Persistent volume `./data:/app/data:Z` (SELinux label). With `USERNS_MODE=keep-id:uid=1000,gid=1000` the host user is mapped to UID 1000 in rootless Podman, so `./data` is writable without `chown`.
  Alternative (without keep-id): `podman unshare chown 1000:1000 data`.
- Health check against `/api/health` (in `compose.yaml`; the `HEALTHCHECK` in the Dockerfile only applies in Podman with `--format docker`).
- `extra_hosts: unifi.local:host-gateway` as an example of reaching the controller by host name.

**Update:**
```bash
git pull && podman-compose up -d --build
```

**Stack managers (Portainer, Dockge, Komodo, Arcane …):** An `.env` file is optional (`env_file … required: false`). All variables are also passed through the `environment:` block via `${VAR}` interpolation, so it is enough to set the variables in the stack UI. Additional compose variables:

| Variable | Default | Purpose |
|---|---|---|
| `HOST_PORT` | `3004` | external port |
| `DATA_PATH` | `./data` | host path for the SQLite DB, or `unifi-dashboard-data` for the named volume (permissions set automatically) |
| `USERNS_MODE` | empty | rootless Podman: `keep-id:uid=1000,gid=1000` |

**Docker instead of Podman:** The easiest option is `DATA_PATH=unifi-dashboard-data` (named volume). Otherwise the data directory must be writable for UID 1000: `mkdir -p data && sudo chown 1000:1000 data` (or the path set in `DATA_PATH`).

## Development

```bash
npm install
cp .env.example .env    # set UNIFI_MOCK=true, COOKIE_SECURE=false, SESSION_SECRET
npm run dev             # http://localhost:3000
npm run build           # production build (standalone)
npm run typecheck       # also catches missing German translations
```

## Configuration (overview)

| Variable | Default | Description |
|---|---|---|
| `UNIFI_CONTROLLER_URL` | – | e.g. `https://192.168.1.1` |
| `UNIFI_SITE_ID` | `default` | one or more sites, comma-separated, or `*` |
| `UNIFI_API_KEY` | – | API key (UniFi OS) |
| `UNIFI_USERNAME` / `UNIFI_PASSWORD` | – | alternative to the API key |
| `UNIFI_CONTROLLER_TYPE` | `auto` | `auto` / `unifios` / `classic` |
| `UNIFI_VERIFY_SSL` | `true` | `false` for self-signed certificates |
| `POLLING_INTERVAL_MS` | `5000` | backend polling interval |
| `HISTORY_MINUTES` | `30` | length of the history ring buffer |
| `UNIFI_MOCK` | `false` | demo data |
| `WAN_BANDWIDTH_DOWN_MBPS` / `WAN_BANDWIDTH_UP_MBPS` | – | fallback bandwidth for WAN utilisation if no "Expected ISP Speeds" are set in UniFi for the active WAN (after that: last speed test, peak value) |
| `ACCESS_PASSWORD` | – | access password (empty = Turnstile only) |
| `TURNSTILE_ENABLED` | `false` | enable Turnstile |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | – | Turnstile site key (runtime) |
| `TURNSTILE_SECRET_KEY` | – | Turnstile secret key |
| `ADMIN_PASSWORD` | – | password for `/admin` |
| `SESSION_SECRET` | – | ≥ 32 characters, JWT signature |
| `SESSION_TTL_HOURS` | `12` | session lifetime |
| `COOKIE_SECURE` | `true` | `Secure` flag of the cookie |
| `HIDE_SENSITIVE_IPS` | `true` | mask WAN IP & client MACs for non-admins |
| `DATA_DIR` | `./data` (container: `/app/data`) | location of the SQLite DB |
| `VOUCHER_PRESETS` | `1440,1,,,;4320,1,,,;10080,3,,,` | voucher presets `Name=minutes,uses,up kbit/s,down kbit/s,MB;` (name optional; without a name the label is generated in the interface language; format compatible with `VOUCHER_TYPES` of unifi-voucher-site) |
| `VOUCHER_WIFI_SSID` | – | SSID of the guest Wi-Fi for the printout and QR code |
| `VOUCHER_WIFI_PASSWORD` | – | WPA password of the guest Wi-Fi (empty = open network with portal) |
| `VOUCHER_NOTE_REQUIRED` | `false` | require a note when creating |
| `VOUCHER_MAX_BATCH` | `100` | max. vouchers per creation |

## API (BFF)

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/verify` | – | gate: Turnstile + user account (⇒ user/admin) or access password (⇒ viewer) |
| `GET` | `/api/status/:address` | see above | data of a status page (its groups only) |
| `POST` / `DELETE` | `/api/auth/admin` | session | admin upgrade / back to viewer |
| `POST` | `/api/auth/logout` | – | delete the session |
| `POST` | `/api/locale` | – | set the interface language (`{ locale: "en" \| "de" }`; also saved to the account when signed in) |
| `GET` | `/api/health` | – | health check |
| `GET` | `/api/unifi/sites` | viewer | configured sites |
| `GET` | `/api/unifi/dashboard?site=` | viewer | aggregated dashboard data incl. history |
| `GET` / `PUT` | `/api/admin/networks` | admin | live networks + visibility/anonymisation |
| `GET` / `POST` | `/api/admin/groups` | admin | read/create groups |
| `PUT` / `DELETE` | `/api/admin/groups/:id` | admin | update/delete a group |
| `PUT` | `/api/admin/groups/order` | admin | set the order |
| `GET` | `/api/admin/devices` | admin | live switches/APs incl. group assignment |
| `GET` / `POST` | `/api/admin/device-groups` | admin | read/create device groups |
| `PUT` / `DELETE` | `/api/admin/device-groups/:id` | admin | update/delete a device group |
| `PUT` | `/api/admin/device-groups/order` | admin | order of the device groups |
| `GET` / `PUT` | `/api/admin/settings` | admin | global settings (incl. `defaultLanguage`) |
| `GET` / `POST` | `/api/admin/status-pages` | admin | read/create status pages |
| `PUT` / `DELETE` | `/api/admin/status-pages/:id` | admin | update/delete a status page |
| `GET` / `POST` | `/api/admin/users` | admin | read/create users |
| `PUT` / `DELETE` | `/api/admin/users/:id` | admin | update/delete a user |
| `GET` / `POST` | `/api/admin/vouchers?site=` | admin | read vouchers + presets / create vouchers |
| `POST` | `/api/admin/vouchers/delete` | admin | revoke vouchers (`{ site, ids }`) |

API error messages follow the caller's language (account, cookie or `Accept-Language`).

## License

Copyright (C) 2026 Christoph ([@irqnet](https://github.com/irqnet))

This project is licensed under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`), see [LICENSE](LICENSE).

In short: you may use, modify and redistribute it, but modified versions you distribute **or make available to users over a network** must also be released under the AGPL-3.0, including the source code. Third-party components keep their own licences.
