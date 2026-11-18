import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { PrintToolbar } from '@/components/vouchers/PrintToolbar';
import { getSession } from '@/lib/auth';
import { resolveSite } from '@/lib/site';
import { formatDuration, listVouchers, wifiInfo, type VoucherView } from '@/lib/vouchers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Voucher drucken' };

/** Escaping für das WIFI:-QR-Format (\ ; , : " müssen maskiert werden). */
function esc(v: string) {
  return v.replace(/([\;,:"])/g, '\\$1');
}

function limits(v: VoucherView): string[] {
  const out: string[] = [];
  out.push(v.quota === 0 ? 'Mehrfach nutzbar' : v.quota === 1 ? 'Für 1 Gerät' : `Für ${v.quota} Geräte`);
  const kb = (k: number | null) => (k ? (k >= 1000 ? `${+(k / 1000).toFixed(1)} Mbit/s` : `${k} kbit/s`) : null);
  if (v.down) out.push(`Download max. ${kb(v.down)}`);
  if (v.up) out.push(`Upload max. ${kb(v.up)}`);
  if (v.megabytes) out.push(`Datenvolumen ${v.megabytes >= 1024 ? `${+(v.megabytes / 1024).toFixed(1)} GB` : `${v.megabytes} MB`}`);
  return out;
}

export default async function VoucherPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect('/gate');
  if (session.role !== 'admin') redirect('/admin/login');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? '';
  const site = await resolveSite(one('site') || null);
  const ids = new Set(one('ids').split(',').filter(Boolean));
  const layout = one('layout') === 'bon' ? 'bon' : 'a4';

  let vouchers: VoucherView[] = [];
  let error: string | null = null;
  if (!site) error = 'Unbekannte Site';
  else {
    try {
      vouchers = (await listVouchers(site)).vouchers.filter((v) => ids.has(v.id));
    } catch (err) {
      error = (err as Error).message;
    }
  }

  const wifi = wifiInfo();
  const qr = wifi.ssid
    ? await QRCode.toString(
        wifi.password ? `WIFI:T:WPA;S:${esc(wifi.ssid)};P:${esc(wifi.password)};;` : `WIFI:T:nopass;S:${esc(wifi.ssid)};;`,
        { type: 'svg', margin: 0, errorCorrectionLevel: 'M' },
      )
    : null;

  return (
    <div className="voucher-print min-h-screen">
      <style>{`@page { size: ${layout === 'bon' ? '80mm auto' : 'A4'}; margin: ${layout === 'bon' ? '4mm' : '10mm'}; }`}</style>
      <PrintToolbar count={vouchers.length} layout={layout} autoPrint={!error && vouchers.length > 0} />
      {error && <p className="p-6 text-center text-rose-700">{error}</p>}
      {!error && vouchers.length === 0 && <p className="p-6 text-center text-slate-600">Keine passenden Voucher gefunden.</p>}

      <div
        className={
          layout === 'bon'
            ? 'mx-auto flex w-[80mm] flex-col gap-0 bg-white print:w-full'
            : 'mx-auto grid max-w-[210mm] grid-cols-2 gap-[6mm] p-[6mm] print:max-w-none print:p-0'
        }
      >
        {vouchers.map((v) => (
          <article
            key={v.id}
            className={
              layout === 'bon'
                ? 'break-after-page border-b border-dashed border-slate-400 px-[4mm] py-[6mm] text-center last:border-0'
                : 'break-inside-avoid rounded-xl border-2 border-dashed border-slate-300 bg-white p-[6mm] text-slate-900'
            }
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Gäste-WLAN</div>
            {wifi.ssid && <div className="mt-1 text-lg font-semibold">{wifi.ssid}</div>}
            <div className={layout === 'bon' ? 'mt-4' : 'mt-4 flex items-center gap-[5mm]'}>
              {qr && (
                <div
                  className={layout === 'bon' ? 'mx-auto mb-4 h-[38mm] w-[38mm] [&>svg]:h-full [&>svg]:w-full' : 'h-[30mm] w-[30mm] shrink-0 [&>svg]:h-full [&>svg]:w-full'}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              )}
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Zugangscode</div>
                <div className="whitespace-nowrap font-mono text-[22px] font-bold tracking-[0.08em] text-slate-900">{v.code}</div>
                {wifi.password && (
                  <div className="mt-1 text-xs text-slate-600">
                    WLAN-Passwort: <span className="font-mono font-semibold text-slate-900">{wifi.password}</span>
                  </div>
                )}
              </div>
            </div>
            <ul className={layout === 'bon' ? 'mt-4 space-y-0.5 text-xs text-slate-700' : 'mt-4 space-y-0.5 text-xs text-slate-700'}>
              <li>Gültig für {formatDuration(v.minutes)} ab erster Anmeldung</li>
              {limits(v).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-snug text-slate-500">
              {qr ? 'QR-Code scannen oder' : 'Mit dem WLAN'} {wifi.ssid ? `„${wifi.ssid}“` : ''} verbinden und im Anmeldefenster den Zugangscode eingeben.
            </p>
            {v.note && <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">{v.note}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
