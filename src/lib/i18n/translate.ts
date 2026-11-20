/**
 * Translation lookup shared by server and client. Messages are flat
 * "area.key" strings; "{name}" placeholders are replaced from params.
 * A message of the form "one|other" is a plural: params.count === 1 picks
 * the first variant, everything else the second.
 */
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from './config';
import { messages, type MessageKey } from './messages';

export type { MessageKey };
export type TParams = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: TParams) => string;

export function translate(locale: Locale, key: MessageKey, params?: TParams): string {
  let msg: string = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  if (params) {
    if (typeof params.count === 'number' && msg.includes('|')) {
      const [one, other] = msg.split('|');
      msg = params.count === 1 ? one : other;
    }
    const tag = LOCALE_TAGS[locale];
    msg = msg.replace(/\{(\w+)\}/g, (m, name: string) => {
      const v = params[name];
      if (v === undefined) return m;
      return typeof v === 'number' ? v.toLocaleString(tag) : v;
    });
  }
  return msg;
}

export function createT(locale: Locale): TFunction {
  return (key, params) => translate(locale, key, params);
}
