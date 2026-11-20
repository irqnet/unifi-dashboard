/**
 * Locale-aware voucher formatting, shared by the server (print page, preset
 * labels) and the client (voucher management).
 */
import type { TFunction } from './i18n/translate';

export interface VoucherSpec {
  minutes: number;
  /** 0 = unlimited, 1 = single use, n = n devices */
  quota: number;
  up: number | null;
  down: number | null;
  megabytes: number | null;
}

export function formatDuration(minutes: number, t: TFunction): string {
  if (minutes % 1440 === 0) return t('voucher.duration.days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('voucher.duration.hours', { count: minutes / 60 });
  return t('voucher.duration.minutes', { count: minutes });
}

export function formatKbps(kbps: number): string {
  return kbps >= 1000 ? `${+(kbps / 1000).toFixed(1)} Mbit/s` : `${kbps} kbit/s`;
}

export function formatMegabytes(mb: number): string {
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function describeSpec(s: VoucherSpec, t: TFunction): string {
  const parts = [
    formatDuration(s.minutes, t),
    s.quota === 0 ? t('voucher.spec.unlimited') : s.quota === 1 ? t('voucher.spec.singleUse') : t('voucher.spec.devices', { count: s.quota }),
  ];
  if (s.down || s.up) parts.push(`↓ ${s.down ? formatKbps(s.down) : '∞'} / ↑ ${s.up ? formatKbps(s.up) : '∞'}`);
  if (s.megabytes) parts.push(formatMegabytes(s.megabytes));
  return parts.join(' · ');
}
