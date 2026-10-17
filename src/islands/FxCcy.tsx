import { useEffect, useState } from 'react';
import { getFx, fmtFx, fmtFxDate, fmtFxTime, fmtFxSource, relTime } from '../lib/fx.js';
import { markFeedOk, lastUpdatedLine } from '../lib/feedState.js';
import type { FxDoc, FxHistoryPoint } from '../lib/types.js';

/* React-owned FX currency section. One mount per currency via
   data-island="fx-ccy" data-ccy="USD|EUR|GBP". Paints the official/parallel/
   spread cards and draws the history SVG into the existing elements —
   static "₦·" placeholders stay if the feed fails. Renders nothing itself. */

function el(id: string): HTMLElement | null { return document.getElementById(id); }
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

function chartSVG(history: FxHistoryPoint[] | undefined): { svg: string; range: string } {
  const pts = (history || []).filter((p) => (p.official > 0) || (p.parallel > 0));
  if (pts.length < 2) {
    return {
      svg: '<text x="500" y="180" text-anchor="middle" class="fx-empty">History is accumulating. The trend line appears after a few daily pulls.</text>',
      range: '',
    };
  }
  const W = 1000, H = 360, P = 36;
  const vals: number[] = [];
  pts.forEach((p) => {
    if (p.official > 0) vals.push(p.official);
    if (p.parallel > 0) vals.push(p.parallel);
  });
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  if (hi - lo < 1) hi = lo + 1;
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const x = (i: number) => P + (W - 2 * P) * (i / (pts.length - 1));
  const y = (v: number) => H - P - (H - 2 * P) * ((v - lo) / (hi - lo));
  function line(key: 'official' | 'parallel', cls: string): string {
    let d = '', started = false;
    pts.forEach((p, i) => {
      const v = p[key];
      if (!(v > 0)) { started = false; return; }
      d += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      started = true;
    });
    return d ? '<path d="' + d + '" class="' + cls + '" fill="none" stroke-width="3"/>' : '';
  }
  return {
    svg: '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" class="fx-axis"/>' +
      line('official', 'fx-line-official') + line('parallel', 'fx-line-parallel'),
    range: ' · ' + fmtFxDate(pts[0].date) + ' → ' + fmtFxDate(pts[pts.length - 1].date),
  };
}

interface FxCcyProps { ccy?: string }

export default function FxCcy(props: FxCcyProps): null {
  const ccy = (props.ccy || 'USD').toUpperCase();
  const P = cap(ccy);
  const [doc, setDoc] = useState<FxDoc | null>(null);

  useEffect(() => {
    let alive = true;
    getFx().then((d) => { if (alive) setDoc(d); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!doc) return;
    const latest = doc.latest || {};
    const history = doc.history || {};
    const legs = latest[ccy];
    const usable = !!(legs && (legs.official > 0 || legs.parallel > 0));
    if (usable) markFeedOk('fx', fmtFxDate(legs!.official_date));
    /* clear state on failure: never a permanent ₦· */
    function unavailCard(valId: string, subId: string, label: string) {
      const v = el(valId), d = el(subId);
      const last = lastUpdatedLine('fx');
      if (v) { v.innerHTML = '<span class="val-unavail">Unavailable</span>'; }
      if (d) d.textContent = label + ' temporarily unavailable' + (last ? ' · ' + last : '.');
    }
    if (legs) {
      if (legs.official > 0) {
        const o = el('fx' + P + 'Official'); if (o) o.textContent = fmtFx(legs.official);
        const od = el('fx' + P + 'OfficialDate'); if (od) od.textContent = 'Official (CBN NFEM) · ' + fmtFxDate(legs.official_date);
      } else {
        unavailCard('fx' + P + 'Official', 'fx' + P + 'OfficialDate', 'Official rate');
      }
      if (legs.parallel > 0) {
        const pl = el('fx' + P + 'Parallel'); if (pl) pl.textContent = fmtFx(legs.parallel);
        const pd = el('fx' + P + 'ParallelDate'); if (pd) pd.textContent = 'Parallel market · via ' + fmtFxSource(legs.parallel_source) + ' · ' + fmtFxTime(legs.parallel_updated_at) + ' (' + relTime(legs.parallel_updated_at) + ')';
      } else {
        unavailCard('fx' + P + 'Parallel', 'fx' + P + 'ParallelDate', 'Parallel rate');
      }
      if (legs.official > 0 && legs.parallel > 0) {
        const spread = legs.parallel - legs.official;
        const sp = el('fx' + P + 'Spread');
        if (sp) sp.textContent = '₦' + Math.abs(spread).toLocaleString('en-NG', { maximumFractionDigits: 2 });
        const spct = el('fx' + P + 'SpreadPct');
        if (spct) spct.textContent = Math.abs(spread / legs.official * 100).toFixed(2) + (spread >= 0 ? '% above official' : '% below official');
      } else {
        const sp = el('fx' + P + 'Spread');
        if (sp) sp.innerHTML = '<span class="val-unavail">Unavailable</span>';
        const spct = el('fx' + P + 'SpreadPct');
        if (spct) spct.textContent = '';
      }
    } else {
      /* no legs at all: whole section is down */
      unavailCard('fx' + P + 'Official', 'fx' + P + 'OfficialDate', 'Official rate');
      unavailCard('fx' + P + 'Parallel', 'fx' + P + 'ParallelDate', 'Parallel rate');
      const sp = el('fx' + P + 'Spread');
      if (sp) sp.innerHTML = '<span class="val-unavail">Unavailable</span>';
      const spct = el('fx' + P + 'SpreadPct');
      if (spct) spct.textContent = '';
    }
    const svg = el('fx' + P + 'Chart');
    if (svg) {
      if (usable) {
        const drawn = chartSVG(history[ccy]);
        svg.innerHTML = drawn.svg;
        const rg = el('fx' + P + 'ChartRange');
        if (rg) rg.textContent = drawn.range;
      } else {
        const last = lastUpdatedLine('fx');
        svg.innerHTML = '<text x="500" y="180" text-anchor="middle" class="fx-empty">Rate history temporarily unavailable' + (last ? ' · ' + last : '') + '.</text>';
      }
    }
    /* hero date pill: painted once by the first-mounted section.
       Driven by actual usability — the /api/fx payload carries no pulled_at. */
    const hd = el('fxHeroDate') as HTMLElement | null;
    if (hd && !hd.dataset.fxPainted) {
      if (usable) {
        hd.textContent = 'Updated ' + fmtFxTime(legs!.parallel_updated_at) + ' (' + relTime(legs!.parallel_updated_at) + ')';
      } else {
        const last = lastUpdatedLine('fx');
        hd.textContent = last ? 'Rates unavailable · ' + last : 'Rates unavailable';
      }
      hd.dataset.fxPainted = '1';
    }
  }, [doc, ccy, P]);

  return null;
}
