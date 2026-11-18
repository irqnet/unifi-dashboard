import type { DeviceGroupInput, DisplayMode, GroupInput } from './db';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Validiert/normalisiert Gruppen-Eingaben aus dem Admin-Bereich. */
export function parseGroupInput(body: unknown, partial = false): { value: GroupInput } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Ungültige Anfrage' };
  const b = body as Record<string, unknown>;
  const out: GroupInput = { name: '' };

  if (b.name !== undefined || !partial) {
    if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'Name ist erforderlich' };
    if (b.name.length > 80) return { error: 'Name ist zu lang (max. 80 Zeichen)' };
    out.name = b.name.trim();
  } else {
    delete (out as Partial<GroupInput>).name;
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string' || b.description.length > 300) return { error: 'Ungültige Beschreibung' };
    out.description = b.description.trim();
  }
  if (b.color !== undefined) {
    if (typeof b.color !== 'string' || !HEX.test(b.color)) return { error: 'Ungültige Farbe' };
    out.color = b.color;
  }
  if (b.displayMode !== undefined) {
    if (b.displayMode !== 'consolidated' && b.displayMode !== 'expanded') return { error: 'Ungültiger Anzeige-Modus' };
    out.displayMode = b.displayMode as DisplayMode;
  }
  if (b.anonymizeClients !== undefined) out.anonymizeClients = !!b.anonymizeClients;
  if (b.hidden !== undefined) out.hidden = !!b.hidden;
  if (b.networkIds !== undefined) {
    if (!Array.isArray(b.networkIds) || b.networkIds.some((x) => typeof x !== 'string' || x.length > 64)) {
      return { error: 'Ungültige Netzwerkliste' };
    }
    out.networkIds = b.networkIds as string[];
  }
  return { value: out };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const MAC = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;

/** Validiert Eingaben für Geräte-Gruppen (Switche & Access Points). */
export function parseDeviceGroupInput(body: unknown, partial = false): { value: Partial<DeviceGroupInput> } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Ungültige Anfrage' };
  const b = body as Record<string, unknown>;
  const out: Partial<DeviceGroupInput> = {};
  if (b.name !== undefined || !partial) {
    if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'Name ist erforderlich' };
    if (b.name.length > 80) return { error: 'Name ist zu lang (max. 80 Zeichen)' };
    out.name = b.name.trim();
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string' || b.description.length > 300) return { error: 'Ungültige Beschreibung' };
    out.description = b.description.trim();
  }
  if (b.color !== undefined) {
    if (typeof b.color !== 'string' || !HEX.test(b.color)) return { error: 'Ungültige Farbe' };
    out.color = b.color;
  }
  if (b.hidden !== undefined) out.hidden = !!b.hidden;
  if (b.deviceMacs !== undefined) {
    if (!Array.isArray(b.deviceMacs) || b.deviceMacs.some((x) => typeof x !== 'string' || !MAC.test(x))) {
      return { error: 'Ungültige Geräteliste' };
    }
    out.deviceMacs = b.deviceMacs as string[];
  }
  return { value: out };
}
