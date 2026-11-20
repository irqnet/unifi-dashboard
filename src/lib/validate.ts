import type { DeviceGroupInput, DisplayMode, GroupInput } from './db';
import type { MessageKey } from './i18n/translate';

/* Validation errors are message keys; route handlers translate them via apiError(). */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Validates/normalises group input from the admin area. */
export function parseGroupInput(body: unknown, partial = false): { value: GroupInput } | { error: MessageKey } {
  if (!body || typeof body !== 'object') return { error: 'api.badRequest' };
  const b = body as Record<string, unknown>;
  const out: GroupInput = { name: '' };

  if (b.name !== undefined || !partial) {
    if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'validate.nameRequired' };
    if (b.name.length > 80) return { error: 'validate.nameTooLong' };
    out.name = b.name.trim();
  } else {
    delete (out as Partial<GroupInput>).name;
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string' || b.description.length > 300) return { error: 'validate.badDescription' };
    out.description = b.description.trim();
  }
  if (b.color !== undefined) {
    if (typeof b.color !== 'string' || !HEX.test(b.color)) return { error: 'validate.badColor' };
    out.color = b.color;
  }
  if (b.displayMode !== undefined) {
    if (b.displayMode !== 'consolidated' && b.displayMode !== 'expanded') return { error: 'validate.badDisplayMode' };
    out.displayMode = b.displayMode as DisplayMode;
  }
  if (b.anonymizeClients !== undefined) out.anonymizeClients = !!b.anonymizeClients;
  if (b.hidden !== undefined) out.hidden = !!b.hidden;
  if (b.networkIds !== undefined) {
    if (!Array.isArray(b.networkIds) || b.networkIds.some((x) => typeof x !== 'string' || x.length > 64)) {
      return { error: 'validate.badNetworkList' };
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

/** Validates input for device groups (switches & access points). */
export function parseDeviceGroupInput(body: unknown, partial = false): { value: Partial<DeviceGroupInput> } | { error: MessageKey } {
  if (!body || typeof body !== 'object') return { error: 'api.badRequest' };
  const b = body as Record<string, unknown>;
  const out: Partial<DeviceGroupInput> = {};
  if (b.name !== undefined || !partial) {
    if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'validate.nameRequired' };
    if (b.name.length > 80) return { error: 'validate.nameTooLong' };
    out.name = b.name.trim();
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string' || b.description.length > 300) return { error: 'validate.badDescription' };
    out.description = b.description.trim();
  }
  if (b.color !== undefined) {
    if (typeof b.color !== 'string' || !HEX.test(b.color)) return { error: 'validate.badColor' };
    out.color = b.color;
  }
  if (b.hidden !== undefined) out.hidden = !!b.hidden;
  if (b.deviceMacs !== undefined) {
    if (!Array.isArray(b.deviceMacs) || b.deviceMacs.some((x) => typeof x !== 'string' || !MAC.test(x))) {
      return { error: 'validate.badDeviceList' };
    }
    out.deviceMacs = b.deviceMacs as string[];
  }
  return { value: out };
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const USERNAME = /^[A-Za-z0-9._@-]{2,64}$/;

function idList(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > 500 || v.some((x) => !Number.isInteger(x) || (x as number) <= 0)) return null;
  return v as number[];
}

export interface ParsedStatusPage {
  site?: string;
  slug?: string;
  title?: string;
  description?: string;
  showWan?: boolean;
  isPublic?: boolean;
  groupIds?: number[];
  deviceGroupIds?: number[];
}

/** Validates input for status pages. */
export function parseStatusPageInput(body: unknown, partial = false): { value: ParsedStatusPage } | { error: MessageKey } {
  if (!body || typeof body !== 'object') return { error: 'api.badRequest' };
  const b = body as Record<string, unknown>;
  const out: ParsedStatusPage = {};
  if (b.title !== undefined || !partial) {
    if (typeof b.title !== 'string' || !b.title.trim()) return { error: 'validate.titleRequired' };
    if (b.title.length > 80) return { error: 'validate.titleTooLong' };
    out.title = b.title.trim();
  }
  if (b.slug !== undefined || !partial) {
    if (typeof b.slug !== 'string' || !SLUG.test(b.slug)) {
      return { error: 'validate.badSlug' };
    }
    out.slug = b.slug;
  }
  if (b.description !== undefined) {
    if (typeof b.description !== 'string' || b.description.length > 300) return { error: 'validate.badDescription' };
    out.description = b.description.trim();
  }
  if (b.showWan !== undefined) out.showWan = !!b.showWan;
  if (b.isPublic !== undefined) out.isPublic = !!b.isPublic;
  if (b.groupIds !== undefined) {
    const ids = idList(b.groupIds);
    if (!ids) return { error: 'validate.badGroupList' };
    out.groupIds = ids;
  }
  if (b.deviceGroupIds !== undefined) {
    const ids = idList(b.deviceGroupIds);
    if (!ids) return { error: 'validate.badDeviceGroupList' };
    out.deviceGroupIds = ids;
  }
  return { value: out };
}

export interface ParsedUser {
  username?: string;
  displayName?: string;
  password?: string;
  isAdmin?: boolean;
  disabled?: boolean;
  pageIds?: number[];
}

/** Validates input for user accounts. The password is only required when creating. */
export function parseUserInput(body: unknown, partial = false): { value: ParsedUser } | { error: MessageKey } {
  if (!body || typeof body !== 'object') return { error: 'api.badRequest' };
  const b = body as Record<string, unknown>;
  const out: ParsedUser = {};
  if (b.username !== undefined || !partial) {
    if (typeof b.username !== 'string' || !USERNAME.test(b.username.trim())) {
      return { error: 'validate.badUsername' };
    }
    out.username = b.username.trim();
  }
  if (b.displayName !== undefined) {
    if (typeof b.displayName !== 'string' || b.displayName.length > 80) return { error: 'validate.badDisplayName' };
    out.displayName = b.displayName.trim();
  }
  if ((b.password !== undefined && b.password !== '') || !partial) {
    if (typeof b.password !== 'string' || b.password.length < 8) return { error: 'validate.passwordTooShort' };
    if (b.password.length > 200) return { error: 'validate.passwordTooLong' };
    out.password = b.password;
  }
  if (b.isAdmin !== undefined) out.isAdmin = !!b.isAdmin;
  if (b.disabled !== undefined) out.disabled = !!b.disabled;
  if (b.pageIds !== undefined) {
    const ids = idList(b.pageIds);
    if (!ids) return { error: 'validate.badPageList' };
    out.pageIds = ids;
  }
  return { value: out };
}
