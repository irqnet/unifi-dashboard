# UniFi Network Status- & Monitoring-Dashboard

Echtzeit-Statusseite für UniFi-Netzwerke im NOC-Stil: WAN-Status, konsolidierte VLAN-Gruppen mit Live-Traffic-Verlauf, Switch-Port-Matrix und Access-Point-Auslastung. Geschützt durch ein kombiniertes **Passwort- & Cloudflare-Turnstile-Gate** und einen separaten **Admin-Bereich** zur Gruppierung von Netzwerken/VLANs.

- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Lucide · Recharts · SQLite (`better-sqlite3`) · `jose` (JWT)
- **Betrieb:** lokal gebautes Container-Image mit Podman / `podman-compose` (kein Registry-Build, keine GitHub Actions)

---

## Architektur

```
Browser ──► middleware.ts (JWT-Cookie prüfen: viewer / admin)
   │
   ├─ /gate ─────────────── Zugangs-Gate (ACCESS_PASSWORD + Turnstile) ─► POST /api/auth/verify
   ├─ / ─────────────────── Dashboard (Client) ── pollt ──► GET /api/unifi/dashboard?site=…
   └─ /admin ────────────── Admin-UI ─────────────────────► /api/admin/{groups,networks,settings}
                                                                     │
   Next.js Route Handler (BFF, Node-Runtime) ◄───────────────────────┘
     ├─ lib/unifi/client.ts     UniFi-API-Client (API-Key oder Login + CSRF, Self-Signed-SSL)
     ├─ lib/unifi/poller.ts     Hintergrund-Poller je Site + In-Memory-Ringpuffer (Verlauf)
     ├─ lib/unifi/aggregate.ts  Gruppen-Aggregation, Datenschutz, Hardware-Normalisierung
     └─ lib/db.ts               SQLite: Gruppen, Netzwerk-Optionen, Einstellungen (/app/data/dashboard.db)
```

- **Backend-for-Frontend:** Der Browser spricht nie direkt mit dem Controller. Zugangsdaten bleiben serverseitig, CORS und Self-Signed-Zertifikate (`UNIFI_VERIFY_SSL=false`) werden im BFF gehandhabt.
- **Poller & Ringpuffer:** Pro Site wird im Intervall `POLLING_INTERVAL_MS` gepollt; jedes Sample speichert Down-/Upstream und Client-Zahl je Netzwerk sowie den WAN-Durchsatz. Der Puffer hält die letzten `HISTORY_MINUTES` (Standard 30). Gruppen-Verläufe werden daraus durch Summierung der enthaltenen VLANs berechnet. Der Verlauf ist bewusst flüchtig (geht bei Neustart verloren).
- **UniFi-Endpunkte:** `stat/device`, `stat/sta`, `rest/networkconf` (60 s gecacht), `stat/health`, `self/sites`. Präfix `/proxy/network` für UniFi OS, ohne Präfix für klassische Controller.
- **Client-Zuordnung zu VLANs:** `network_id` → Netzwerkname → Subnetz-Match der Client-IP.
- **Traffic-Richtung:** `tx_bytes-r` (bzw. `wired-tx_bytes-r`) aus Sicht der Infrastruktur = **Download** zum Client, `rx_bytes-r` = **Upload**.

## Sicherheit: Zwei-Stufen-Zugriff

| Bereich | Erforderliche Rolle | Ohne Berechtigung |
|---|---|---|
| `/gate`, `/api/auth/verify`, `/api/health` | – (öffentlich) | – |
| `/`, `/api/unifi/*` | `viewer` oder `admin` | Gate-Seite bzw. `401` |
| `/admin/login`, `/api/auth/admin` | gültige Session | Gate-Seite bzw. `401` |
| `/admin`, `/api/admin/*` (GET/POST/PUT/DELETE) | `admin` | Admin-Login bzw. `401/403` |

1. **Zugangs-Gate:** Verlangt `ACCESS_PASSWORD` (falls gesetzt) und/oder Cloudflare Turnstile (`TURNSTILE_ENABLED=true`). Das Passwort wird per `crypto.timingSafeEqual` (über SHA-256-Digests, längenunabhängig) verglichen, das Turnstile-Token serverseitig gegen `https://challenges.cloudflare.com/turnstile/v0/siteverify` geprüft – inkl. Client-IP aus `CF-Connecting-IP` / `X-Forwarded-For`. Erfolg ⇒ signiertes JWT-Cookie `ud_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, `role: "viewer"`).
2. **Admin:** Über das Zahnrad im Header ⇒ `/admin/login` ⇒ `ADMIN_PASSWORD` (ebenfalls timing-safe) hebt das JWT auf `role: "admin"` an. „Admin beenden“ stuft wieder auf `viewer` zurück.
3. **Defense-in-Depth:** Zusätzlich zur Middleware prüft jeder Route Handler die Rolle erneut. Login-Endpunkte sind per IP rate-limitiert (10 Versuche / 5 min).
4. **Datenschutz:** `HIDE_SENSITIVE_IPS=true` maskiert WAN-IP und Client-MACs für Nicht-Admins. Pro Netzwerk/Gruppe können Clients anonymisiert oder Netzwerke komplett ausgeblendet werden.

> Fehlt `SESSION_SECRET` (≥ 32 Zeichen) oder ist Turnstile aktiviert aber unvollständig konfiguriert, zeigt das Gate einen Konfigurationsfehler statt sich zu öffnen.

## Cloudflare Turnstile einrichten

1. Cloudflare Dashboard → **Turnstile** → *Add widget*.
2. Hostname(s) eintragen, unter denen das Dashboard erreichbar ist (z. B. `status.example.com`; für lokale Tests zusätzlich `localhost`).
3. Widget-Modus *Managed* wählen.
4. **Site Key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, **Secret Key** → `TURNSTILE_SECRET_KEY`, `TURNSTILE_ENABLED=true`.

Der Site Key wird zur **Laufzeit** aus der `.env` gelesen – ein Rebuild nach Änderung ist nicht nötig.
Für Tests ohne echte Keys bietet Cloudflare Dummy-Keys an (Site `1x00000000000000000000AA`, Secret `1x0000000000000000000000000000000AA`).

**Passwort-Varianten:**
- Nur Turnstile: `ACCESS_PASSWORD=` leer lassen, `TURNSTILE_ENABLED=true`
- Nur Passwort: `ACCESS_PASSWORD=…`, `TURNSTILE_ENABLED=false`
- Beides (empfohlen für externen Zugriff): beide setzen

## UniFi-Zugang

**Empfohlen – API-Key (UniFi OS):** UniFi Network → *Einstellungen → Control Plane → Integrationen* → API-Key erstellen → `UNIFI_API_KEY`.

**Alternativ – lokaler Benutzer:** Einen lokalen Read-Only-Admin anlegen und `UNIFI_USERNAME` / `UNIFI_PASSWORD` setzen. `UNIFI_CONTROLLER_TYPE=auto` probiert zuerst UniFi OS (`/api/auth/login`, CSRF aus `x-csrf-token`), dann den klassischen Controller (`/api/login`, Cookie `unifises` + `csrf_token`). Bei Ablauf der Session wird automatisch neu angemeldet.

**Multi-Site:** `UNIFI_SITE_ID=default,filiale` oder `UNIFI_SITE_ID=*` (alle Sites des Controllers). Auswahl im Header-Dropdown.

**Demo ohne Controller:** `UNIFI_MOCK=true` liefert simulierte Daten (2 Sites, Switche, APs, VLANs).

## Admin-Anleitung (`/admin`)

1. Im Dashboard oben rechts auf das **Zahnrad** klicken und mit `ADMIN_PASSWORD` anmelden.
2. **Standort** im Header wählen – die Netzwerke/VLANs werden live aus `rest/networkconf` geladen.
3. **Neue Gruppe** anlegen (z. B. „Gäste & Nachbarn“), Farbe wählen und per Multi-Select beliebig viele Netzwerke (Name · VLAN · Subnetz) zuordnen. Ein Netzwerk gehört immer zu höchstens einer Gruppe – wird es einer neuen Gruppe zugewiesen, wird es aus der alten verschoben.
4. **Anzeige-Modus** je Gruppe:
   - *Konsolidiert:* eine Karte mit summierten Clients (LAN/WLAN), kombiniertem Traffic und gemeinsamem Verlaufsgraph. Klick öffnet den Drill-Down mit VLAN-Aufschlüsselung und Top-Clients.
   - *Einzelkarten je VLAN:* Gruppen-Überschrift mit Summen, darunter je VLAN eine eigene Karte.
5. **Reihenfolge** mit den Pfeilen ändern – sie bestimmt die Anordnung auf dem Dashboard.
6. **Datenschutz:** *Anonymisieren* ersetzt Hostnamen/IP/MAC der Clients (z. B. Gäste-VLAN) durch „Client n“. *Sichtbar* aus blendet die Gruppe von der Statusseite aus.
7. **Netzwerk-Tabelle:** Einzelne VLANs komplett ausblenden oder anonymisieren; Schalter *„Nicht gruppierte VLANs auf Statusseite anzeigen“* steuert, ob ungruppierte Netzwerke als Einzelkarten erscheinen.

8. **Geräte-Gruppen (Switche & Access Points):** Unter *Neue Geräte-Gruppe* Switche und APs (Name · Modell · MAC, mit Filter) zu Gruppen wie „Rack Keller“ oder „Außenbereich“ zusammenfassen. Die Zuordnung erfolgt über die MAC-Adresse und bleibt bei Umbenennungen erhalten. Gruppen lassen sich sortieren und ausblenden; nicht gruppierte Geräte erscheinen darunter als „Weitere Switche“ / „Weitere Access Points“ (abschaltbar).

Alle Einstellungen liegen in `data/dashboard.db` (SQLite, WAL-Modus). Ist das Verzeichnis nicht beschreibbar, läuft das Dashboard mit einer In-Memory-Datenbank weiter, der Admin-Bereich zeigt eine Warnung und das Log nennt Pfad und UID.

## Lokales Deployment mit Podman

Voraussetzungen: Podman ≥ 4.3 und `podman-compose` (oder `podman compose`).

```bash
git clone https://github.com/irqnet/unifi-dashboard.git
cd unifi-dashboard

cp .env.example .env
# Secret erzeugen und in .env eintragen:
openssl rand -base64 48
nano .env

mkdir -p data
podman-compose up -d --build        # oder: podman compose up -d --build
podman-compose logs -f
```

Das Dashboard ist danach unter **`http://<host>:3004`** erreichbar (Port-Mapping `3004:3000` in `compose.yaml`).

**Wichtig – HTTPS & Cookies:** Das Session-Cookie ist standardmäßig `Secure` und wird von Browsern nur über HTTPS (oder `localhost`) gespeichert. Für den externen Zugriff das Dashboard hinter einen TLS-Reverse-Proxy bzw. Cloudflare Tunnel stellen (Ziel `http://<host>:3004`). Nur für einen Test im LAN per `http://IP:3004` vorübergehend `COOKIE_SECURE=false` setzen.

**Container-Details**
- Multi-Stage-Build auf `node:20-alpine`; `python3`, `make`, `g++` nur in der Build-Stage für `better-sqlite3`.
- Läuft als Non-Root-User `node` (UID 1000), `read_only: true` mit `tmpfs` für `/tmp` und `/app/.next/cache`, `cap_drop: ALL`, `no-new-privileges`.
- Persistentes Volume `./data:/app/data:Z` (SELinux-Label). Mit `USERNS_MODE=keep-id:uid=1000,gid=1000` wird der Host-Benutzer im Rootless-Podman auf UID 1000 abgebildet, sodass `./data` ohne `chown` beschreibbar ist.
  Alternative (ohne keep-id): `podman unshare chown 1000:1000 data`.
- Healthcheck gegen `/api/health` (in `compose.yaml`; der `HEALTHCHECK` im Dockerfile greift bei Podman nur mit `--format docker`).
- `extra_hosts: unifi.local:host-gateway` als Beispiel, um den Controller per Hostname anzusprechen.

**Update:**
```bash
git pull && podman-compose up -d --build
```

**Stack-Manager (Portainer, Dockge, Komodo, Arcane …):** Eine `.env`-Datei ist optional (`env_file … required: false`). Alle Variablen werden zusätzlich über den `environment:`-Block per `${VAR}`-Interpolation übernommen – es reicht also, die Variablen im Stack-UI zu hinterlegen. Zusätzliche Compose-Variablen:

| Variable | Standard | Zweck |
|---|---|---|
| `HOST_PORT` | `3004` | externer Port |
| `DATA_PATH` | `./data` | Host-Pfad für die SQLite-DB, oder `unifi-dashboard-data` für das benannte Volume (Rechte automatisch korrekt) |
| `USERNS_MODE` | leer | Rootless Podman: `keep-id:uid=1000,gid=1000` |

**Docker statt Podman:** Am einfachsten `DATA_PATH=unifi-dashboard-data` setzen (benanntes Volume). Alternativ muss das Datenverzeichnis für UID 1000 beschreibbar sein: `mkdir -p data && sudo chown 1000:1000 data` (bzw. für den unter `DATA_PATH` gesetzten Pfad).

## Entwicklung

```bash
npm install
cp .env.example .env    # UNIFI_MOCK=true, COOKIE_SECURE=false, SESSION_SECRET setzen
npm run dev             # http://localhost:3000
npm run build           # Produktions-Build (standalone)
npm run typecheck
```

## Konfiguration (Übersicht)

| Variable | Standard | Beschreibung |
|---|---|---|
| `UNIFI_CONTROLLER_URL` | – | z. B. `https://192.168.1.1` |
| `UNIFI_SITE_ID` | `default` | eine/mehrere Sites, kommagetrennt, oder `*` |
| `UNIFI_API_KEY` | – | API-Key (UniFi OS) |
| `UNIFI_USERNAME` / `UNIFI_PASSWORD` | – | Alternative zum API-Key |
| `UNIFI_CONTROLLER_TYPE` | `auto` | `auto` / `unifios` / `classic` |
| `UNIFI_VERIFY_SSL` | `true` | `false` für Self-Signed-Zertifikate |
| `POLLING_INTERVAL_MS` | `5000` | Backend-Pollintervall |
| `HISTORY_MINUTES` | `30` | Länge des Verlaufs-Ringpuffers |
| `UNIFI_MOCK` | `false` | Demo-Daten |
| `ACCESS_PASSWORD` | – | Zugangspasswort (leer = nur Turnstile) |
| `TURNSTILE_ENABLED` | `false` | Turnstile aktivieren |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | – | Turnstile Site Key (Laufzeit) |
| `TURNSTILE_SECRET_KEY` | – | Turnstile Secret Key |
| `ADMIN_PASSWORD` | – | Passwort für `/admin` |
| `SESSION_SECRET` | – | ≥ 32 Zeichen, JWT-Signatur |
| `SESSION_TTL_HOURS` | `12` | Gültigkeit der Session |
| `COOKIE_SECURE` | `true` | `Secure`-Flag des Cookies |
| `HIDE_SENSITIVE_IPS` | `true` | WAN-IP & Client-MACs für Nicht-Admins maskieren |
| `DATA_DIR` | `./data` (Container: `/app/data`) | Speicherort der SQLite-DB |

## API (BFF)

| Methode | Pfad | Rolle | Zweck |
|---|---|---|---|
| `POST` | `/api/auth/verify` | – | Gate: Passwort + Turnstile ⇒ viewer-Session |
| `POST` / `DELETE` | `/api/auth/admin` | Session | Admin-Upgrade / zurück auf viewer |
| `POST` | `/api/auth/logout` | – | Session löschen |
| `GET` | `/api/health` | – | Health-Check |
| `GET` | `/api/unifi/sites` | viewer | Konfigurierte Sites |
| `GET` | `/api/unifi/dashboard?site=` | viewer | Aggregierte Dashboard-Daten inkl. Verlauf |
| `GET` / `PUT` | `/api/admin/networks` | admin | Live-Netzwerke + Sichtbarkeit/Anonymisierung |
| `GET` / `POST` | `/api/admin/groups` | admin | Gruppen lesen/anlegen |
| `PUT` / `DELETE` | `/api/admin/groups/:id` | admin | Gruppe ändern/löschen |
| `PUT` | `/api/admin/groups/order` | admin | Reihenfolge setzen |
| `GET` | `/api/admin/devices` | admin | Live-Switche/APs inkl. Gruppenzuordnung |
| `GET` / `POST` | `/api/admin/device-groups` | admin | Geräte-Gruppen lesen/anlegen |
| `PUT` / `DELETE` | `/api/admin/device-groups/:id` | admin | Geräte-Gruppe ändern/löschen |
| `PUT` | `/api/admin/device-groups/order` | admin | Reihenfolge der Geräte-Gruppen |
| `GET` / `PUT` | `/api/admin/settings` | admin | Globale Einstellungen |
