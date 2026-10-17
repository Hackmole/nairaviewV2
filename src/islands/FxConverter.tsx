import { useEffect, useRef, useState } from 'react';
import { getFx, fmtFx, fmtFxDate, fmtFxTime, fmtFxSource, relTime } from '../lib/fx.js';
import { getJSON } from '../lib/api.js';
import { markFeedOk, lastUpdatedLine } from '../lib/feedState.js';
import type { FxDoc } from '../lib/types.js';

/* React-owned FX converter. Adopts the existing card DOM (#fxAmount, the custom
   currency dropdown #fxCcyDrop, .fx-rate-toggle) and paints the result into
   #fxConvertResult / #fxConvertNote. Renders nothing itself. */

function el(id: string): HTMLElement | null { return document.getElementById(id); }

export default function FxConverter(): null {
  const [amount, setAmount] = useState<number>(100);
  const [ccy, setCcy] = useState('USD');
  const [leg, setLeg] = useState('official');
  const [dir, setDir] = useState<'to-ngn' | 'from-ngn'>('to-ngn');
  const [amtCcy, setAmtCcy] = useState('USD');
  const [rates, setRates] = useState<FxDoc['latest'] | null>(null);
  const [fxFailed, setFxFailed] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    let alive = true;
    getFx().then((doc) => {
      if (!alive) return;
      settled.current = true;
      const latest = (doc && doc.latest) || null;
      const usable = latest && Object.keys(latest).some((k) => {
        const l = (latest as Record<string, { official?: number; parallel?: number }>)[k];
        return l && ((l.official || 0) > 0 || (l.parallel || 0) > 0);
      });
      setRates(latest);
      setFxFailed(!usable);
    });
    getJSON<{ date: string; lede: string; moves: Record<string, { official: number; parallel: number; d_official: number; d_parallel: number; premium_pct: number }>; watch: string[] }[]>(
      'assets/fx-recaps.json?v=20261017a').then((recaps) => {
      if (!alive || !recaps || !recaps.length) return;
      const fN = (x: number) => '\u20a6' + x.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sgn = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2);
      const names: Record<string, string> = { USD: 'US dollar', EUR: 'Euro', GBP: 'British pound' };
      const cur = recaps[0];
      const lede = el('fxRecapLede'); if (lede) lede.textContent = cur.lede;
      const mv = document.querySelector('#fxRecapMoves tbody');
      if (mv) mv.innerHTML = Object.keys(names).filter((k) => cur.moves[k]).map((k) => {
        const m = cur.moves[k];
        return '<tr><td>' + names[k] + '</td><td>' + fN(m.official) + ' (' + sgn(m.d_official) + ')</td><td>' + fN(m.parallel) + ' (' + sgn(m.d_parallel) + ')</td><td>' + m.premium_pct.toFixed(2) + '%</td></tr>';
      }).join('');
      const wt = el('fxRecapWatch'); if (wt) wt.textContent = 'What to watch: ' + cur.watch.join('; ') + '.';
      const ar = el('fxRecapArchive');
      if (ar) ar.innerHTML = recaps.slice(1).map((r) =>
        '<li><details><summary>' + r.date + '</summary><p>' + r.lede + '</p></details></li>').join('');
    }).catch(() => { /* baked recap stays */ });
    const amtEl = el('fxAmount') as HTMLInputElement | null;
    function onAmt() { if (amtEl) { const v = parseFloat(amtEl.value); setAmount(isNaN(v) ? NaN : v); } }
    if (amtEl) {
      amtEl.addEventListener('input', onAmt);
      const v0 = parseFloat(amtEl.value);
      if (!isNaN(v0)) setAmount(v0);
    }
    /* Custom currency dropdown (a native select's option list can't be styled
       reliably, so this listbox replaces it). */
    const btn = el('fxCcyBtn') as HTMLButtonElement | null;
    const list = el('fxCcyList');
    const label = el('fxCcyLabel');
    const opts = list ? Array.prototype.slice.call(list.querySelectorAll('[role="option"]')) as HTMLElement[] : [];
    let cur = 'USD';
    let isOpen = false;
    let focusIdx = 0;
    function paint() {
      opts.forEach((o) => {
        o.setAttribute('aria-selected', o.getAttribute('data-ccy') === cur ? 'true' : 'false');
        o.classList.remove('fx-focus');
      });
      if (label) label.textContent = cur;
      if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (list) list.hidden = !isOpen;
    }
    function choose(v: string) {
      cur = v;
      setCcy(v);
      isOpen = false;
      paint();
      if (btn) btn.focus();
    }
    function openList() {
      isOpen = true;
      focusIdx = Math.max(0, opts.findIndex((o) => o.getAttribute('data-ccy') === cur));
      paint();
    }
    function onBtnClick() { if (isOpen) { isOpen = false; paint(); } else openList(); }
    function onOptClick(e: Event) {
      const v = (e.currentTarget as HTMLElement).getAttribute('data-ccy');
      if (v) choose(v);
    }
    function onDocClick(e: Event) {
      if (isOpen && !(e.target as HTMLElement).closest('#fxCcyDrop')) { isOpen = false; paint(); }
    }
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (!isOpen) {
        if (t === btn && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openList(); }
        return;
      }
      if (e.key === 'Escape') { isOpen = false; paint(); if (btn) btn.focus(); }
      else if (t === btn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); isOpen = false; paint(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusIdx = (focusIdx + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts.forEach((o, i) => o.classList.toggle('fx-focus', i === focusIdx));
        opts[focusIdx].focus();
      } else if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute('role') === 'option') {
        e.preventDefault();
        const v = t.getAttribute('data-ccy');
        if (v) choose(v);
      }
    }
    if (btn) btn.addEventListener('click', onBtnClick);
    opts.forEach((o) => o.addEventListener('click', onOptClick));
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    const toggles = Array.prototype.slice.call(document.querySelectorAll('.fx-rate-toggle')) as HTMLElement[];
    function onToggle(e: Event) {
      const b = e.currentTarget as HTMLElement;
      setLeg(b.getAttribute('data-leg') || 'official');
      toggles.forEach((t) => {
        const on = t === b;
        t.classList.toggle('active', on);
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    toggles.forEach((t) => { t.addEventListener('click', onToggle); });
    const dirToggles = Array.prototype.slice.call(document.querySelectorAll('.fx-dir-toggle')) as HTMLElement[];
    function onDirToggle(e: Event) {
      const b = e.currentTarget as HTMLElement;
      setDir((b.getAttribute('data-dir') as 'to-ngn' | 'from-ngn') || 'to-ngn');
      dirToggles.forEach((x) => {
        const on = x === b;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    dirToggles.forEach((x) => { x.addEventListener('click', onDirToggle); });
    /* everyday-amount table currency tabs */
    const amtTabs = Array.prototype.slice.call(document.querySelectorAll('#fxAmtCcy button')) as HTMLElement[];
    function onAmtTab(e: Event) {
      const b = e.currentTarget as HTMLElement;
      setAmtCcy(b.getAttribute('data-ccy') || 'USD');
      amtTabs.forEach((x) => {
        const on = x === b;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    amtTabs.forEach((x) => { x.addEventListener('click', onAmtTab); });
    return () => {
      alive = false;
      if (amtEl) amtEl.removeEventListener('input', onAmt);
      if (btn) btn.removeEventListener('click', onBtnClick);
      opts.forEach((o) => o.removeEventListener('click', onOptClick));
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      toggles.forEach((t) => { t.removeEventListener('click', onToggle); });
      dirToggles.forEach((x) => { x.removeEventListener('click', onDirToggle); });
      amtTabs.forEach((x) => { x.removeEventListener('click', onAmtTab); });
    };
  }, []);

  useEffect(() => {
    const res = el('fxConvertResult'), note = el('fxConvertNote');
    if (!res) return;
    const legs = rates && rates[ccy];
    const rate = legs ? legs[leg as 'official' | 'parallel'] : undefined;
    if (!legs || !(rate && rate > 0) || !(amount >= 0) || isNaN(amount)) {
      if (fxFailed && settled.current) {
        /* feed failed: clear state, not a permanent spinner */
        const last = lastUpdatedLine('fx');
        res.classList.remove('skel');
        res.innerHTML = '<span class="val-unavail">Rate unavailable</span>';
        if (note) note.textContent = 'Rate temporarily unavailable' + (last ? ' · ' + last : '.');
      } else {
        /* loading: shimmer block instead of a bare placeholder */
        res.textContent = '';
        res.classList.add('skel');
        if (note) note.textContent = 'Rate loading…';
      }
      return;
    }
    res.classList.remove('skel');
    markFeedOk('fx', fmtFxDate(legs.official_date));
    const sym: Record<string, string> = { USD: '$', EUR: '\u20ac', GBP: '\u00a3' };
    const legName = leg === 'official' ? 'official NFEM rate' : 'indicative street rate';
    const trust = leg === 'official' ? '' : ' \u00b7 via ' + fmtFxSource(legs!.parallel_source) + ', ' + relTime(legs!.parallel_updated_at);
    if (dir === 'to-ngn') {
      res.textContent = fmtFx(amount * (rate as number));
      if (note) note.textContent = amount.toLocaleString('en-NG') + ' ' + ccy + ' at the ' + legName + ' (' + fmtFxDate(legs!.official_date) + ')' + trust;
    } else {
      const out = (rate as number) > 0 ? amount / (rate as number) : 0;
      res.textContent = (sym[ccy] || '') + out.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (note) note.textContent = '\u20a6' + amount.toLocaleString('en-NG') + ' buys ' + (sym[ccy] || '') + out.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' at the ' + legName + ' (' + fmtFxDate(legs!.official_date) + ')' + trust;
    }
    /* everyday-amount table */
    const amtBody = document.querySelector('#fxAmtTable tbody');
    const amtNote = el('fxAmtNote');
    const al = rates && rates[amtCcy];
    if (amtBody && al && al.official > 0 && al.parallel > 0) {
      const AMTS = [1, 5, 10, 50, 100, 500, 1000, 5000];
      amtBody.innerHTML = AMTS.map((a) =>
        '<tr' + (a === 100 ? ' class="amt-hero"' : '') + '><td>' + a.toLocaleString('en-NG') + '</td><td>' + fmtFx(a * al.official) + '</td><td>' + fmtFx(a * al.parallel) + '</td></tr>'
      ).join('');
      if (amtNote) amtNote.textContent = 'Street rate \u00b7 via ' + fmtFxSource(al.parallel_source) + ' \u00b7 ' + fmtFxTime(al.parallel_updated_at) + '.';
    }
  }, [rates, amount, ccy, leg, dir, amtCcy, fxFailed]);

  return null;
}
