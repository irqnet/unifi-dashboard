/** WAN helpers shared by the aggregation and the history recorder. */
import type { RawDevice, RawNetwork } from './types';

/** Key of a WAN network: WAN, WAN2, WAN3 … */
export const wanKey = (n: RawNetwork) => (n.wan_networkgroup ?? 'WAN').toUpperCase();

/** Enabled WAN networks, sorted WAN, WAN2, WAN3 … */
export function wanNetworks(networks: RawNetwork[]): RawNetwork[] {
  return networks
    .filter((n) => n.purpose === 'wan' && n.enabled !== false)
    .sort((a, b) => wanKey(a).localeCompare(wanKey(b), 'en', { numeric: true }));
}

/** Gateway port of a WAN key (WAN → wan1, WAN2 → wan2 …). */
export function wanPort(gw: RawDevice | undefined, key: string) {
  const idx = key === 'WAN' ? 1 : Number(key.slice(3)) || 0;
  return idx >= 1 && idx <= 3 ? gw?.[`wan${idx as 1 | 2 | 3}`] : undefined;
}

/**
 * Determines the currently active WAN network (for failover/multi-WAN):
 * 1. gateway uplink (uplink.comment/name = WAN, WAN2 …)
 * 2. WAN IP from stat/health matching a WAN port of the gateway, or a backup port up while WAN1 is down
 * 3. otherwise the primary WAN (wan_networkgroup = WAN)
 */
export function findActiveWan(networks: RawNetwork[], gw: RawDevice | undefined, wanIp: string | null): RawNetwork | undefined {
  const wans = networks.filter((n) => n.purpose === 'wan' && n.enabled !== false);
  if (!wans.length) return undefined;
  const byGroup = (g: string | undefined) => (g ? wans.find((n) => (n.wan_networkgroup ?? 'WAN').toUpperCase() === g.toUpperCase()) : undefined);
  const uplinkGroup = [gw?.uplink?.comment, gw?.uplink?.name].find((v) => v && /^WAN\d*$/i.test(v));
  const fromUplink = byGroup(uplinkGroup);
  if (fromUplink) return fromUplink;
  if (wanIp && gw) {
    // WAN IP of a port, or a backup port that is up while WAN1 is down (WAN2 and WAN3)
    for (const i of [2, 3] as const) {
      const p = gw[`wan${i}`];
      if (p?.ip === wanIp || (p?.up && gw.wan1?.up === false)) {
        const w = byGroup(`WAN${i}`);
        if (w) return w;
      }
    }
    if (gw.wan1?.ip === wanIp) {
      const w1 = byGroup('WAN');
      if (w1) return w1;
    }
  }
  return byGroup('WAN') ?? wans[0];
}
