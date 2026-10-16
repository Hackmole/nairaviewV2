import { useEffect, useState } from 'react';

/* Earnings dashboard data. Adopt-style island: fetches the curated
   assets/earnings.json (season status, delays, filings) and repaints the
   board. Static HTML stays as the fallback. */

interface ErFiling {
  company: string;
  period: string;
  headline: string;
}
interface ErResult {
  ticker: string;
  company: string;
  sector: string;
  period: string;
  revenue: number;
  revenue_unit: string;
  revenue_yoy: number | null;
  profit: number;
  profit_unit: string;
  profit_yoy: number | null;
  eps_kobo: number | null;
  filed: string;
  note?: string;
}
interface ErWatch {
  ticker: string;
  company: string;
  sector: string;
}
interface ErDoc {
  as_of: string;
  season: string;
  period_ended: string;
  deadline: string;
  delays: Array<{ company: string; status: string; detail: string }>;
  due_note: string;
  filings: ErFiling[];
  results: ErResult[];
  watchlist: ErWatch[];
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

export default function Earnings(): null {
  const [doc, setDoc] = useState<ErDoc | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('assets/earnings.json?v=20261016a')
      .then((r) => { if (!r.ok) throw new Error('bad status'); return r.json() as Promise<ErDoc>; })
      .then((d) => { if (alive) setDoc(d); })
      .catch(() => { /* static fallback stays */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!doc) return;
    const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const setText = (id: string, t: string) => { const el = document.getElementById(id); if (el) el.textContent = t; };

    setText('erSeasonNote', doc.season + ' ended ' + fmtDate(doc.period_ended) + '. Unaudited statements are due on the NGX by ' + fmtDate(doc.deadline) + '. Filings typically cluster in the final two weeks.');

    const rows = doc.delays.map((d) =>
      '<tr><td>' + esc(d.company) + '</td><td>' + esc(d.status) + '</td><td>' + esc(d.detail) + '</td></tr>'
    );
    rows.push('<tr><td>All other listed companies</td><td>Due</td><td>' + esc(doc.due_note) + '</td></tr>');
    set('erTableBody', rows.join(''));

    if (doc.filings.length) {
      set('erFiledBody', doc.filings.map((f) =>
        '<tr><td>' + esc(f.company) + '</td><td>' + esc(f.period) + '</td><td>' + esc(f.headline) + '</td></tr>'
      ).join(''));
      const fw = document.getElementById('erFiledWrap');
      if (fw) fw.hidden = false;
    }

    /* 1. Results tracker */
    const yoy = (v: number | null) => v === null || v === undefined
      ? '·'
      : '<span class="' + (v < 0 ? 'down' : 'up') + '">' + (v < 0 ? '\u2212' : '+') + Math.abs(v).toFixed(0) + '%</span>';
    const money = (v: number, u: string) => '\u20A6' + v.toFixed(2) + u;
    if (doc.results && doc.results.length) {
      set('erResultsBody', doc.results.map((r) =>
        '<tr><td><a href="stocks/' + esc(r.ticker) + '">' + esc(r.company) + '</a></td>' +
        '<td>' + money(r.revenue, r.revenue_unit) + ' ' + yoy(r.revenue_yoy) + '</td>' +
        '<td>' + money(r.profit, r.profit_unit) + ' ' + yoy(r.profit_yoy) + '</td>' +
        '<td>' + (r.eps_kobo === null || r.eps_kobo === undefined ? '·' : (r.eps_kobo / 100).toFixed(2)) + '</td>' +
        '<td>' + fmtDate(r.filed) + '</td></tr>'
      ).join(''));
      /* 2. Growth leaderboard, ranked by profit YoY */
      const ranked = doc.results.slice().sort((a, b) => (b.profit_yoy ?? -Infinity) - (a.profit_yoy ?? -Infinity));
      set('erGrowthBody', ranked.map((r, i) =>
        '<tr><td>' + (i + 1) + '</td><td><a href="stocks/' + esc(r.ticker) + '">' + esc(r.company) + '</a></td>' +
        '<td>' + esc(r.sector) + '</td><td>' + yoy(r.profit_yoy) + ' profit</td><td>' + yoy(r.revenue_yoy) + ' revenue</td></tr>'
      ).join(''));
    }

    /* 3. Who is left to report */
    if (doc.watchlist && doc.watchlist.length) {
      set('erWatchBody', doc.watchlist.map((w) =>
        '<tr><td><a href="stocks/' + esc(w.ticker) + '">' + esc(w.company) + '</a></td>' +
        '<td>' + esc(w.sector) + '</td><td>Expected by ' + fmtDate(doc.deadline) + '</td></tr>'
      ).join(''));
    }

    setText('erVintage', 'Statuses as of ' + fmtDate(doc.as_of) + '. This board updates as ' + doc.season + ' filings hit the NGX.');
  }, [doc]);

  return null;
}
