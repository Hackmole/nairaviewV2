import { useEffect, useState } from 'react';

/* Fixed income hub data. Adopt-style island: fetches the curated
   assets/fixed-income.json (NTB auction results, savings bond offers) and
   repaints the tables + trend chart. Static HTML stays as the fallback. */

interface FiDoc {
  as_of: string;
  ntb_latest: { date: string; rates: Record<string, number>; changes: Record<string, string> };
  ntb_history_364d: Array<{ date: string; rate: number }>;
  savings_bonds: { offer: string; subscription: string; min_subscription: number; tenors: Array<{ tenor: string; coupon: number }> };
  vs_stocks_note: string;
}

const TENORS = [['91d', '91-day'], ['182d', '182-day'], ['364d', '364-day']] as const;

function fmtDate(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return Number(m[3]) + ' ' + M[Number(m[2]) - 1] + ' ' + m[1];
}
function fmtDateShort(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Number(m[3]) + ' ' + M[Number(m[2]) - 1];
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function trendSVG(hist: Array<{ date: string; rate: number }>): string {
  if (hist.length < 2) return '';
  const W = 620, H = 240, L = 40, B = 200, T = 20;
  const rates = hist.map((p) => p.rate);
  const lo = Math.min(...rates), hi = Math.max(...rates);
  const span = Math.max(hi - lo, 0.5);
  const X = (i: number) => 60 + (i * (W - 60 - 30)) / (hist.length - 1);
  const Y = (r: number) => T + (1 - (r - lo) / span) * (B - T - 10);
  const pts = hist.map((p, i) => X(i).toFixed(0) + ',' + Y(p.rate).toFixed(0)).join(' ');
  const dots = hist.map((p, i) =>
    '<circle cx="' + X(i).toFixed(0) + '" cy="' + Y(p.rate).toFixed(0) + '" r="4" fill="#32D9EB"/>' +
    '<text x="' + X(i).toFixed(0) + '" y="' + (Y(p.rate) - 12).toFixed(0) + '" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace">' + p.rate.toFixed(2) + '%</text>' +
    '<text x="' + (X(i) - 8).toFixed(0) + '" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace">' + fmtDateShort(p.date) + '</text>'
  ).join('');
  const gridVals = [Math.ceil(lo), Math.ceil(lo + span / 2), Math.ceil(hi)];
  const grid = gridVals.map((g) =>
    '<text x="8" y="' + (Y(g) + 4).toFixed(0) + '" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono,monospace">' + g + '%</text>'
  ).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="364-day NTB stop rate trend" style="width:100%;height:auto;display:block">' +
    '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + B + '" stroke="var(--line)" stroke-width="1"/>' +
    '<line x1="' + L + '" y1="' + B + '" x2="' + W + '" y2="' + B + '" stroke="var(--line)" stroke-width="1"/>' +
    grid + '<polyline points="' + pts + '" fill="none" stroke="#32D9EB" stroke-width="3"/>' + dots + '</svg>';
}

function curveSVG(pts: Array<{ tenor: string; years: number; yield: number }>): string {
  if (pts.length < 2) return '';
  const W = 620, H = 240, L = 40, B = 200, T = 20;
  const ys = pts.map((p) => p.yield);
  const lo = Math.min(...ys) - 0.3, hi = Math.max(...ys) + 0.3;
  const xlo = Math.min(...pts.map((p) => p.years)), xhi = Math.max(...pts.map((p) => p.years));
  const X = (yr: number) => 60 + ((yr - xlo) / Math.max(xhi - xlo, 1)) * (W - 60 - 30);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (B - T - 10);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p.years).toFixed(0) + ',' + Y(p.yield).toFixed(0)).join(' ');
  const dots = pts.map((p) =>
    '<circle cx="' + X(p.years).toFixed(0) + '" cy="' + Y(p.yield).toFixed(0) + '" r="4" fill="#32D9EB"/>' +
    '<text x="' + X(p.years).toFixed(0) + '" y="' + (Y(p.yield) - 12).toFixed(0) + '" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace" text-anchor="middle">' + p.yield.toFixed(2) + '%</text>' +
    '<text x="' + X(p.years).toFixed(0) + '" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace" text-anchor="middle">' + esc(p.tenor) + '</text>'
  ).join('');
  const grid = [Math.ceil(lo), Math.round((lo + hi) / 2), Math.floor(hi)].map((g) =>
    '<text x="8" y="' + (Y(g) + 4).toFixed(0) + '" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono,monospace">' + g + '%</text>'
  ).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="FGN bond yield curve" style="width:100%;height:auto;display:block">' +
    '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + B + '" stroke="var(--line)" stroke-width="1"/>' +
    '<line x1="' + L + '" y1="' + B + '" x2="' + W + '" y2="' + B + '" stroke="var(--line)" stroke-width="1"/>' +
    grid + '<path d="' + path + '" fill="none" stroke="#32D9EB" stroke-width="3"/>' + dots + '</svg>';
}

export default function FixedIncome(): null {
  const [doc, setDoc] = useState<FiDoc | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('assets/fixed-income.json?v=20261017a')
      .then((r) => { if (!r.ok) throw new Error('bad status'); return r.json() as Promise<FiDoc>; })
      .then((d) => { if (alive) setDoc(d); })
      .catch(() => { /* static fallback stays */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!doc) return;
    const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const setText = (id: string, t: string) => { const el = document.getElementById(id); if (el) el.textContent = t; };

    setText('fiLatestH', 'Latest NTB auction: ' + fmtDate(doc.ntb_latest.date));
    set('fiLatestBody', TENORS.map(([k, label]) =>
      '<tr><td>' + label + '</td><td>' + doc.ntb_latest.rates[k].toFixed(2) + '%</td><td>' + esc(doc.ntb_latest.changes[k]) + '</td></tr>'
    ).join(''));

    const hist = doc.ntb_history_364d.slice().sort((a, b) => a.date.localeCompare(b.date));
    set('fiTrendChart', '<div class="chart-wrap">' + trendSVG(hist) + '</div>');
    if (hist.length >= 2) {
      const first = hist[0], last = hist[hist.length - 1];
      setText('fiTrendNote', 'From ' + last.rate.toFixed(2) + '% on ' + fmtDate(last.date) + ' vs ' + first.rate.toFixed(2) + '% on ' + fmtDate(first.date) + '. The direction of the risk-free rate.');
    }

    setText('fiBondH', 'FGN Savings Bond: ' + esc(doc.savings_bonds.offer) + ' offer');
    set('fiBondBody', doc.savings_bonds.tenors.map((t) =>
      '<tr><td>' + esc(t.tenor) + '</td><td>' + t.coupon.toFixed(3) + '%</td><td>' + esc(doc.savings_bonds.offer) + '</td></tr>'
    ).join(''));
    setText('fiBondNote', 'Subscriptions ran ' + esc(doc.savings_bonds.subscription) + '. Minimum subscription \u20A6' + doc.savings_bonds.min_subscription.toLocaleString('en-NG') + '.');

    const cal = (doc as any).auction_calendar;
    if (cal) {
      const chips = (cal.upcoming || []).map((d: string) =>
        '<span class="date-chip' + (d === cal.next_auction ? ' next' : '') + '">' + esc(fmtDateShort(d)) + '</span>').join('');
      set('fiCalBody',
        '<p class="lab-note"><strong>Next NTB auction: ' + esc(fmtDate(cal.next_auction)) + '.</strong> ' +
        esc(cal.frequency) + ' (' + esc(cal.run_by) + ').</p>' +
        '<div class="chip-row">' + chips + '</div>' +
        '<p class="lab-note">' + esc(cal.caveat) + '</p>');
    }
    const sbcal = (doc as any).savings_bond_calendar;
    if (sbcal) {
      set('fiSbCalBody',
        '<p class="lab-note"><strong>Next savings bond window: ' + esc(sbcal.next_offer) + '</strong>' +
        (sbcal.expected_window ? ' (expected ' + esc(sbcal.expected_window) + ')' : '') + '. ' +
        esc(sbcal.pattern) + ' ' + esc(sbcal.caveat) + '</p>');
    }
    const notes = (doc as any).auction_notes as Array<{ date: string; text: string }> | undefined;
    if (notes && notes.length) {
      set('fiNotesBody', notes.slice(0, 3).map((n) =>
        '<div class="note-item"><span class="note-date">' + esc(fmtDate(n.date)) + '</span><p class="lab-note">' + esc(n.text) + '</p></div>'
      ).join(''));
    }

    const fba = (doc as any).fgn_bond_auctions;
    if (fba) {
      set('fiBondCalBody',
        '<p class="lab-note"><strong>Next FGN bond auction: ' + esc(fmtDate(fba.next)) + '</strong> (' +
        esc(fba.offer) + ' reopened: ' + (fba.reopenings || []).map(esc).join(', ') + '). ' +
        'Monthly auctions continue ' + (fba.upcoming || []).slice(1).map((d: string) => esc(fmtDate(d))).join(' and ') + '. ' +
        'Minimum \u20A6' + Number(fba.min_subscription).toLocaleString('en-NG') + ' via ' + esc(fba.channel) + '.</p>');
    }

    const curve = (doc as any).fgn_bond_curve;
    if (curve && curve.points && curve.points.length >= 2) {
      set('fiCurveChart', '<div class="chart-wrap">' + curveSVG(curve.points) + '</div>');
      set('fiCurveBody', '<thead><tr><th>Tenor</th><th>Yield</th><th>Week change</th></tr></thead><tbody>' +
        curve.points.map((p: { tenor: string; yield: number; change_bps: number | null }) =>
          '<tr><td>' + esc(p.tenor) + '</td><td>' + p.yield.toFixed(2) + '%</td><td>' +
          (p.change_bps === null || p.change_bps === undefined ? 'n/a' : p.change_bps === 0 ? 'unchanged' : (p.change_bps > 0 ? '+' : '') + p.change_bps + ' bps') +
          '</td></tr>').join('') + '</tbody>');
      setText('fiCurveNote', curve.read + ' (' + curve.source + ', ' + fmtDate(curve.as_of) + '.)');
    }

    const tbillRate = doc.ntb_latest.rates['364d'].toFixed(2) + '%';
    setText('chTbillRate', tbillRate);
    setText('chTbillRate2', tbillRate);
    const sbRates = doc.savings_bonds.tenors.map((t) => t.coupon.toFixed(3) + '%').join(' / ');
    if (sbRates) setText('chSbRate', sbRates);
    setText('fiVintage', 'Figures as of ' + fmtDate(doc.as_of) + '. Auction results update after each DMO/CBN primary market auction, typically held on Wednesdays; the next auction is expected ' + fmtDate((doc as any).auction_calendar?.next_auction || '') + '.');
  }, [doc]);

  return null;
}
