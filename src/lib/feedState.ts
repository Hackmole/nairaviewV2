/* Clear data states for every data widget.
   Rule: show the real value when available; otherwise show a useful message
   ("X temporarily unavailable") plus when data was last good. Never leave a
   permanent-looking dash or spinner.

   Last-good timestamps persist in localStorage so a failed load can still
   say when the feed was last healthy. */

const KEY = 'nv-feed-ok';

interface FeedMark { ts: number; label: string }

function readMap(): Record<string, FeedMark> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, unknown>;
    const out: Record<string, FeedMark> = {};
    Object.keys(raw).forEach((k) => {
      const v = raw[k] as { ts?: unknown; label?: unknown };
      if (v && typeof v.ts === 'number') out[k] = { ts: v.ts, label: typeof v.label === 'string' ? v.label : '' };
    });
    return out;
  } catch {
    return {};
  }
}

/** Record a successful data load. `label` is an optional human date for the
    data itself (e.g. "10 Oct 2026"); otherwise "now" is used. */
export function markFeedOk(feed: string, label?: string): void {
  try {
    const m = readMap();
    m[feed] = { ts: Date.now(), label: label || '' };
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* private mode — skip */
  }
}

function lastMark(feed: string): FeedMark | null {
  const m = readMap();
  return m[feed] || null;
}

/** "11 Oct 2026" in WAT for a timestamp. */
function fmtDayWAT(ts: number): string {
  const d = new Date(ts);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', day: 'numeric', month: 'numeric', year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => (parts.find((p) => p.type === t) || {}).value || '';
  return get('day') + ' ' + M[Number(get('month')) - 1] + ' ' + get('year');
}

/** Human "last updated" line, e.g. "Last updated 10 Oct 2026." or "". */
export function lastUpdatedLine(feed: string): string {
  const m = lastMark(feed);
  if (!m) return '';
  return 'Last updated ' + (m.label || fmtDayWAT(m.ts)) + '.';
}

/** Bare date label, e.g. "10 Oct 2026" or "". */
export function lastUpdatedDate(feed: string): string {
  const m = lastMark(feed);
  if (!m) return '';
  return m.label || fmtDayWAT(m.ts);
}

/** Standard unavailable block HTML for a widget container. */
export function unavailableHTML(title: string, feed: string): string {
  const last = lastUpdatedLine(feed);
  return (
    '<div class="feed-unavailable" role="status">' +
    '<strong>' + title + ' temporarily unavailable.</strong>' +
    '<span>' + (last || 'Please check back shortly.') + '</span>' +
    '</div>'
  );
}

/** Short inline label for value spots, e.g. "Unavailable". */
export function unavailableShort(feed: string): { text: string; sub: string } {
  const last = lastUpdatedLine(feed);
  return {
    text: 'Unavailable',
    sub: last ? 'Temporarily unavailable · ' + last : 'Temporarily unavailable · please check back shortly.',
  };
}
