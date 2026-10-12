import { useEffect, useState } from 'react';

/* Earnings dashboard data. Adopt-style island: fetches the curated
   assets/earnings.json (season status, delays, filings) and repaints the
   board. Static HTML stays as the fallback. */

interface ErFiling {
  company: string;
  period: string;
  headline: string;
}
interface ErDoc {
  as_of: string;
  season: string;
  period_ended: string;
  deadline: string;
  delays: Array<{ company: string; status: string; detail: string }>;
  due_note: string;
  filings: ErFiling[];
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
    fetch('assets/earnings.json?v=20261011a')
      .then((r) => { if (!r.ok) throw new Error('bad status'); return r.json() as Promise<ErDoc>; })
      .then((d) => { if (alive) setDoc(d); })
      .catch(() => { /* static fallback stays */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!doc) return;
    const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const setText = (id: string, t: string) => { const el = document.getElementById(id); if (el) el.textContent = t; };

    setText('erSeasonNote', 'The ' + doc.season + ' quarter ended ' + fmtDate(doc.period_ended) + '. Unaudited statements are due on the NGX by ' + fmtDate(doc.deadline) + '. Filings typically cluster in the final two weeks of the window.');

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

    setText('erVintage', 'Statuses as of ' + fmtDate(doc.as_of) + '. This board updates as ' + doc.season + ' filings hit the NGX.');
  }, [doc]);

  return null;
}
