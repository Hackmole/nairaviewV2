import { useEffect, useState } from 'react';

/* Economy hub data. Adopt-style island: fetches the curated
   assets/economy.json (MPR, inflation, GDP, MPC dates) and repaints the
   stat cards. Static HTML stays as the fallback. */

interface EcDoc {
  as_of: string;
  mpr: { value: number; change: string };
  inflation: { value: number; period: string; source: string; note?: string };
  gdp: { value: number; period: string };
  mpc_next: string;
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

export default function Economy(): null {
  const [doc, setDoc] = useState<EcDoc | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('assets/economy.json?v=20261011a')
      .then((r) => { if (!r.ok) throw new Error('bad status'); return r.json() as Promise<EcDoc>; })
      .then((d) => { if (alive) setDoc(d); })
      .catch(() => { /* static fallback stays */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!doc) return;
    const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const setText = (id: string, t: string) => { const el = document.getElementById(id); if (el) el.textContent = t; };

    set('ecCards',
      '<div class="stat-card"><div class="stat-label">MPR (CBN)</div><div class="stat-value">' + doc.mpr.value.toFixed(2) + '%</div><div class="stat-sub">' + esc(doc.mpr.change) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Inflation (' + esc(doc.inflation.source) + ')</div><div class="stat-value">' + doc.inflation.value.toFixed(2) + '%</div><div class="stat-sub">' + esc(doc.inflation.period) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">GDP growth</div><div class="stat-value">+' + doc.gdp.value.toFixed(2) + '%</div><div class="stat-sub">' + esc(doc.gdp.period) + ', year-on-year</div></div>' +
      '<div class="stat-card"><div class="stat-label">Next MPC meeting</div><div class="stat-value">' + esc(doc.mpc_next) + '</div><div class="stat-sub">2026 \u2014 rate decision expected</div></div>'
    );

    setText('ecInflNote', doc.inflation.note || ('Headline inflation was ' + doc.inflation.value.toFixed(2) + '% in ' + esc(doc.inflation.period) + ' (' + esc(doc.inflation.source) + ').'));
    setText('ecVintage', 'Figures as of ' + fmtDate(doc.as_of) + '.');
  }, [doc]);

  return null;
}
