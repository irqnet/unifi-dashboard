export function formatBps(bps: number | null | undefined, digits = 1): string {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return '–';
  const units = ['bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s', 'Tbit/s'];
  let v = Math.max(0, bps);
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 0 : digits)} ${units[i]}`;
}

/** Short form for chart axes */
export function formatBpsShort(bps: number): string {
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)}G`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(bps >= 1e8 ? 0 : 1)}M`;
  if (bps >= 1e3) return `${Math.round(bps / 1e3)}k`;
  return `${Math.round(bps)}`;
}

export function formatMbps(mbps: number | null | undefined): string {
  if (mbps === null || mbps === undefined) return '–';
  return formatBps(mbps * 1e6, 0);
}

export function formatUptime(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '–';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** `tag` is a BCP 47 locale tag (see LOCALE_TAGS); en-GB keeps the 24-hour clock. */
export function formatTime(ts: number | null | undefined, tag: string): string {
  if (!ts) return '–';
  return new Date(ts).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Port link speed; 0 = no link (shown as "Offline" in both languages). */
export function formatSpeed(mbit: number): string {
  if (!mbit) return 'Offline';
  if (mbit >= 1000) return `${mbit % 1000 === 0 ? mbit / 1000 : (mbit / 1000).toFixed(1)}G`;
  return `${mbit}M`;
}
