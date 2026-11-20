/**
 * All UI messages. English is the source of truth; each area file types its German
 * dictionary as Record<keyof typeof en, string>, so a missing translation fails the build.
 * Messages for both languages of an area live side by side to keep them in sync.
 */
import type { Locale } from '../config';
import * as admin from './admin';
import * as common from './common';
import * as dashboard from './dashboard';
import * as vouchers from './vouchers';

const en = { ...common.en, ...dashboard.en, ...admin.en, ...vouchers.en };
export type MessageKey = keyof typeof en;

export const messages: Record<Locale, Record<MessageKey, string>> = {
  en,
  de: { ...common.de, ...dashboard.de, ...admin.de, ...vouchers.de },
};
