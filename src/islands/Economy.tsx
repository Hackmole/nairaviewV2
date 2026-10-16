import { useEffect, useState } from 'react';

/* Economy hub data. Adopt-style island: fetches the curated
   assets/economy.json (MPR, inflation, GDP, oil, MPC dates, calendar)
   and repaints the stat cards, trend charts, and releases calendar.
   Static HTML stays as the fallback. */

interface HistPt { date?: string; label?: string; period?: string; value: number }
interface CalItem { date: string; label: string; event: string }
interface EcDoc {
  as_of: string;
  mpr: { value: number; change: string };
  inflation: { value: number; period: string; source: string; note?: string };
  gdp: { value: number; period: string };
  mpc_next: string;
  oil?: { grade: string; value: number; unit: string; as_of: string; source: string; note?: string };
  mpr_history?: HistPt[];
  inflation_history?: HistPt[];
  calendar?: CalItem[];
}

function fmtDate(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return Number(m[3]) + ' ' + M[Number(m[2]) - 1] + ' ' + m[1];
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/* Minimal SVG line chart for a small history series. */
function spark(pts: HistPt[], w: number, h: number, color: string): string {
  if (pts.length < 2) return '';
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const px = (i: number) => (i / (pts.length - 1)) * (w - 8) + 4;
  const py = (v: number) => h - 6 - ((v - lo) / span) * (h - 14);
  const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ',' + py(p.value).toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    '<svg class="ec-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' +
    '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2"/>' +
    '<circle cx="' + px(pts.length - 1).toFixed(1) + '" cy="' + py(last.value).toFixed(1) + '" r="3" fill="' + color + '"/>' +
    '</svg>'
  );
}

/* Detailed MPR trend chart: axes, gridlines, value labels, date labels.
   Same visual language as the fixed-income NTB trend chart. */
function mprTrendSVG(hist: HistPt[]): string {
  if (hist.length < 2) return '';
  const W = 620, H = 240, L = 40, B = 200, T = 20;
  const vals = hist.map((p) => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = Math.max(hi - lo, 0.5);
  const X = (i: number) => 60 + (i * (W - 60 - 30)) / (hist.length - 1);
  const Y = (v: number) => T + (1 - (v - lo) / span) * (B - T - 10);
  const pts = hist.map((p, i) => X(i).toFixed(0) + ',' + Y(p.value).toFixed(0)).join(' ');
  const dots = hist.map((p, i) => {
    const label = esc(p.label || p.date || '');
    return '<circle cx="' + X(i).toFixed(0) + '" cy="' + Y(p.value).toFixed(0) + '" r="4" fill="var(--green-strong)"/>' +
    '<text x="' + X(i).toFixed(0) + '" y="' + (Y(p.value) - 12).toFixed(0) + '" fill="var(--ink)" font-size="11" font-family="IBM Plex Mono,monospace" text-anchor="middle">' + p.value.toFixed(2) + '%</text>' +
    '<text x="' + X(i).toFixed(0) + '" y="220" fill="var(--muted)" font-size="10" font-family="IBM Plex Mono,monospace" text-anchor="middle">' + label + '</text>';
  }).join('');
  const gv = (n: number) => Math.round(n * 4) / 4;
  const gridVals = [gv(lo), gv(lo + span / 2), gv(hi)];
  const grid = gridVals.map((g) =>
    '<line x1="' + L + '" y1="' + Y(g).toFixed(0) + '" x2="' + W + '" y2="' + Y(g).toFixed(0) + '" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 5"/>' +
    '<text x="8" y="' + (Y(g) + 4).toFixed(0) + '" fill="var(--muted)" font-size="11" font-family="IBM Plex Mono,monospace">' + g.toFixed(2) + '%</text>'
  ).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="MPR trend" style="width:100%;height:auto;display:block">' +
    '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + B + '" stroke="var(--line)" stroke-width="1"/>' +
    '<line x1="' + L + '" y1="' + B + '" x2="' + W + '" y2="' + B + '" stroke="var(--line)" stroke-width="1"/>' +
    grid + '<polyline points="' + pts + '" fill="none" stroke="var(--green-strong)" stroke-width="3"/>' + dots + '</svg>';
}

export default function Economy(): null {
  const [doc, setDoc] = useState<EcDoc | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('assets/economy.json?v=20261015c')
      .then((r) => { if (!r.ok) throw new Error('bad status'); return r.json() as Promise<EcDoc>; })
      .then((d) => { if (alive) setDoc(d); })
      .catch(() => { /* static fallback stays */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!doc) return;
    const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const setText = (id: string, t: string) => { const el = document.getElementById(id); if (el) el.textContent = t; };

    let cards =
      '<div class="stat-card"><div class="stat-label">MPR (CBN)</div><div class="stat-value">' + doc.mpr.value.toFixed(2) + '%</div><div class="stat-sub">' + esc(doc.mpr.change) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Inflation (' + esc(doc.inflation.source) + ')</div><div class="stat-value">' + doc.inflation.value.toFixed(2) + '%</div><div class="stat-sub">' + esc(doc.inflation.period) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">GDP growth</div><div class="stat-value">+' + doc.gdp.value.toFixed(2) + '%</div><div class="stat-sub">' + esc(doc.gdp.period) + ', year-on-year</div></div>';
    if (doc.oil && doc.oil.value > 0) {
      cards +=
        '<div class="stat-card"><div class="stat-label">' + esc(doc.oil.grade) + ' oil</div><div class="stat-value">$' + doc.oil.value.toFixed(2) + '</div><div class="stat-sub">per barrel, ' + esc(doc.oil.as_of) + '</div></div>';
    }
    cards +=
      '<div class="stat-card"><div class="stat-label">Next MPC meeting</div><div class="stat-value">' + esc(doc.mpc_next) + '</div><div class="stat-sub">2026: rate decision expected</div></div>';
    set('ecCards', cards);

    /* MPR trend chart (detailed: axes, gridlines, value + date labels) */
    const mh = doc.mpr_history || [];
    if (mh.length >= 2) {
      set('ecMprChart', '<div class="chart-wrap">' + mprTrendSVG(mh) + '</div>');
    }

    /* Releases calendar */
    const cal = doc.calendar || [];
    if (cal.length) {
      set('ecCalendar',
        '<ul class="ec-cal">' +
        cal.map((c) => '<li><span class="ec-cal-date">' + esc(c.label) + '</span><span class="ec-cal-event">' + esc(c.event) + '</span></li>').join('') +
        '</ul>'
      );
    }

    setText('ecInflNote', doc.inflation.note || ('Headline inflation was ' + doc.inflation.value.toFixed(2) + '% in ' + esc(doc.inflation.period) + ' (' + esc(doc.inflation.source) + ').'));
    setText('ecVintage', 'Figures as of ' + fmtDate(doc.as_of) + '.');
  }, [doc]);

  return null;
}
