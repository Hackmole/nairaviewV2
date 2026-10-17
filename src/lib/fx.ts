/* Shared /api/fx fetch with a module-level cache so the converter and the
   three currency sections on the FX page make exactly one request. */
import { getJSON } from './api.js';
import type { FxDoc } from './types.js';

let cached: Promise<FxDoc> | null = null;

export function getFx(): Promise<FxDoc> {
  if (!cached) {
    cached = getJSON<FxDoc>('/api/fx').then((doc) => doc || {}).catch(() => {
      cached = null; /* allow a retry on the next mount */
      return {} as FxDoc;
    });
  }
  return cached;
}

export function fmtFx(n: number | null | undefined): string {
  return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtFxDate(iso: string | null | undefined): string {
  if (!iso) return '·';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00Z' : iso);
  if (isNaN(d.getTime())) return '·';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return d.getUTCDate() + ' ' + M[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/* Full timestamp in WAT (UTC+1): "16 Oct 2026, 08:36 WAT". */
export function fmtFxTime(iso: string | null | undefined): string {
  if (!iso) return '·';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '·';
  const wat = new Date(d.getTime() + 60 * 60 * 1000);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(wat.getUTCHours()).padStart(2, '0');
  const mm = String(wat.getUTCMinutes()).padStart(2, '0');
  return wat.getUTCDate() + ' ' + M[wat.getUTCMonth()] + ' ' + wat.getUTCFullYear() + ', ' + hh + ':' + mm + ' WAT';
}

/* Freshness: "25 min ago", "3h ago", "2d ago". */
export function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

/* "monierate" -> "Monierate". */
export function fmtFxSource(s: string | null | undefined): string {
  if (!s) return 'market survey';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
