import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, fmt2, signedPct, esc } from '../lib/api.js';
import type { ApiStock, AsiHistoryResponse, HistoryResponse, PricesResponse } from '../lib/types.js';

/* React-owned stock comparison tool.
   - Mounts on #compareApp (compare.html). Render-style: owns its container.
   - Data: stock list paints instantly from baked window.directory, full
     metrics refresh from /api/prices. Never blank on fetch failure.
   - Pick 2-4 stocks via search; side-by-side metric table.
*/

interface Pick {
  symbol: string;
  name: string;
}

/* Baked snapshot (window.compareSnapshot) so search + table paint instantly
   and survive API failure; the live fetch overwrites with fresh data. */
interface SnapshotRow {
  symbol: string;
  name: string;
  current_price: number;
  official_change_percent?: number | null;
  change_percent?: number | null;
  volume?: number | null;
  market_cap?: number | null;
  sector?: string | null;
}

function baked(): SnapshotRow[] {
  const w = window as unknown as { compareSnapshot?: unknown };
  return Array.isArray(w.compareSnapshot) ? (w.compareSnapshot as SnapshotRow[]) : [];
}

function fmtMcap(n: number | undefined): string {
  if (n == null || !(n > 0)) return '·';
  if (n >= 1e12) return '₦' + (n / 1e12).toFixed(2) + 'tn';
  if (n >= 1e9) return '₦' + (n / 1e9).toFixed(1) + 'bn';
  return '₦' + (n / 1e6).toFixed(1) + 'm';
}

function fmtVol(n: number | undefined): string {
  if (n == null || !(n > 0)) return '·';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'bn';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'm';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

export default function Compare(): React.JSX.Element {
  const [names, setNames] = useState<Pick[]>(() =>
    baked().map((d) => ({ symbol: d.symbol, name: d.name }))
  );
  const [full, setFull] = useState<Record<string, ApiStock>>(() => {
    const map: Record<string, ApiStock> = {};
    baked().forEach((d) => {
      map[d.symbol] = d as unknown as ApiStock;
    });
    return map;
  });
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [live, setLive] = useState(false);
  const [copied, setCopied] = useState(false);
  const paramsRead = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getJSON<PricesResponse>('/api/prices')
      .then((p) => {
        if (cancelled) return;
        const arr = (p && p.stocks && p.stocks.stocks) || [];
        const map: Record<string, ApiStock> = {};
        arr.forEach((s) => {
          map[s.symbol] = s;
        });
        setFull(map);
        setLive(true);
        if (arr.length) {
          setNames(
            arr.map((s) => ({ symbol: s.symbol, name: s.name })).sort((a, b) => a.symbol.localeCompare(b.symbol))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* Shareable comparisons: read ?a=GTCO&b=ZENITHBANK on load (after the
     name list is ready so symbols validate), then keep the URL in sync as
     the selection changes. Follows the screener's deep-link pattern. */
  useEffect(() => {
    if (paramsRead.current || !names.length) return;
    paramsRead.current = true;
    let q: URLSearchParams;
    try { q = new URLSearchParams(window.location.search); } catch { return; }
    const valid = ['a', 'b', 'c', 'd']
      .map((k) => (q.get(k) || '').toUpperCase())
      .filter((s) => s && names.some((n) => n.symbol === s));
    if (valid.length >= 2) setSel(valid.slice(0, 4));
  }, [names]);

  useEffect(() => {
    if (!paramsRead.current) return;
    try {
      const keys = ['a', 'b', 'c', 'd'];
      const qs = sel.map((s, i) => keys[i] + '=' + encodeURIComponent(s)).join('&');
      window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
    } catch { /* noop */ }
  }, [sel]);

  function copyLink() {
    const url = window.location.href;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => { fallbackCopy(url); done(); });
      } else { fallbackCopy(url); done(); }
    } catch { /* noop */ }
  }
  function fallbackCopy(url: string) {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch { /* noop */ }
  }

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return names
      .filter(
        (n) =>
          sel.indexOf(n.symbol) < 0 &&
          (n.symbol.toLowerCase().indexOf(needle) >= 0 || n.name.toLowerCase().indexOf(needle) >= 0)
      )
      .slice(0, 8);
  }, [q, names, sel]);

  const add = (sym: string) => {
    if (sel.length >= 4 || sel.indexOf(sym) >= 0) return;
    setSel([...sel, sym]);
    setQ('');
  };
  const remove = (sym: string) => setSel(sel.filter((s) => s !== sym));

  const rows = sel.map((sym) => full[sym]).filter(Boolean) as ApiStock[];

  const metric = (
    label: string,
    fn: (s: ApiStock) => React.ReactNode,
    cls?: (s: ApiStock) => string
  ) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      {rows.map((s) => (
        <td key={s.symbol} className={cls ? cls(s) : ''}>
          {fn(s)}
        </td>
      ))}
    </tr>
  );

  const chgOf = (s: ApiStock) => {
    const c = s.official_change_percent != null ? s.official_change_percent : s.change_percent;
    return Number(c) || 0;
  };

  /* ---- Intelligent metrics: history-driven ---- */
  const [hist, setHist] = useState<Record<string, number[]>>({});
  const [divYield, setDivYield] = useState<Record<string, number>>({});
  const [asiCloses, setAsiCloses] = useState<number[]>([]);

  /* Fetch per-stock history when the selection changes. */
  useEffect(() => {
    let cancelled = false;
    sel.forEach((sym) => {
      if (hist[sym]) return;
      getJSON<HistoryResponse>('/api/history?symbol=' + encodeURIComponent(sym))
        .then((j) => {
          if (cancelled) return;
          const closes = (j && j.prices ? j.prices.map((p) => p.close) : []).filter(
            (c): c is number => typeof c === 'number' && c > 0
          );
          if (closes.length > 1) setHist((h) => ({ ...h, [sym]: closes }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  /* Dividend yields + ASI history: fetch once. */
  useEffect(() => {
    getJSON<{ dividends?: Array<{ ticker?: string; amount?: number }> }>('assets/dividends.json?v=20261015a')
      .then((j) => {
        const map: Record<string, number> = {};
        (j && j.dividends ? j.dividends : []).forEach((d) => {
          if (d.ticker && typeof d.amount === 'number' && d.amount > 0) {
            const t = d.ticker.toUpperCase();
            map[t] = (map[t] || 0) + d.amount;
          }
        });
        setDivYield(map);
      })
      .catch(() => {});
    getJSON<AsiHistoryResponse>('/api/asi-history')
      .then((j) => {
        const pts = (j && j.history ? j.history : [])
          .map((p) => p.value)
          .filter((c): c is number => typeof c === 'number' && c > 0);
        if (pts.length > 1) setAsiCloses(pts);
      })
      .catch(() => {});
  }, []);

  const closesOf = (sym: string): number[] => hist[sym] || [];
  const retOf = (closes: number[], days: number): number | null => {
    if (closes.length <= days) return null;
    const a = closes[closes.length - 1 - days];
    const b = closes[closes.length - 1];
    if (!(a > 0) || !(b > 0)) return null;
    return ((b / a) - 1) * 100;
  };
  const volOf = (closes: number[]): number | null => {
    if (closes.length < 22) return null;
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > 0 && closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
    }
    if (rets.length < 20) return null;
    const mean = rets.reduce((x, r) => x + r, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((x, r) => x + (r - mean) * (r - mean), 0) / rets.length);
    return sd * Math.sqrt(252) * 100;
  };
  const rangePosOf = (closes: number[]): { pct: number; n: number } | null => {
    if (closes.length < 10) return null;
    const lo = Math.min(...closes);
    const hi = Math.max(...closes);
    const last = closes[closes.length - 1];
    if (!(hi > lo)) return null;
    return { pct: ((last - lo) / (hi - lo)) * 100, n: closes.length };
  };
  const asiRet = (days: number): number | null => retOf(asiCloses, days);

  return (
    <div className="compare-app">
      <div className="compare-picker">
        <label htmlFor="cmpSearch">Add a stock ({sel.length}/4)</label>
        <input
          id="cmpSearch"
          type="search"
          placeholder="Type a ticker or company name…"
          value={q}
          disabled={sel.length >= 4}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {matches.length > 0 && (
          <ul className="compare-suggest">
            {matches.map((m) => (
              <li key={m.symbol}>
                <button type="button" onClick={() => add(m.symbol)}>
                  <strong>{esc(m.symbol)}</strong> · {esc(m.name)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {sel.length > 0 && (
          <div className="compare-chips">
            {sel.map((sym) => (
              <span className="chip" key={sym}>
                {esc(sym)}
                <button type="button" aria-label={'Remove ' + sym} onClick={() => remove(sym)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <p className="guide-p">Pick two to four NGX stocks above to compare them side by side.</p>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="hist-table compare-table">
            <thead>
              <tr>
                <th></th>
                {rows.map((s) => (
                  <th key={s.symbol} scope="col">
                    <a href={'stocks/' + s.symbol + '.html'}>{esc(s.symbol)}</a>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metric('Company', (s) => esc(s.name))}
              {metric('Price', (s) => '₦' + fmt2(s.current_price))}
              {metric(
                'Day change',
                (s) => signedPct(chgOf(s)),
                (s) => (chgOf(s) < 0 ? 'down' : 'up')
              )}
              {metric('Volume', (s) => fmtVol(s.volume))}
              {metric('Market cap', (s) => fmtMcap(s.market_cap))}
              {metric('Sector', (s) => esc(s.sector || '·'))}
              {metric(
                '7-day return',
                (s) => {
                  const r = retOf(closesOf(s.symbol), 7);
                  return r == null ? '·' : signedPct(r);
                },
                (s) => {
                  const r = retOf(closesOf(s.symbol), 7);
                  return r == null ? '' : r < 0 ? 'down' : 'up';
                }
              )}
              {metric(
                '30-day return',
                (s) => {
                  const r = retOf(closesOf(s.symbol), 30);
                  return r == null ? '·' : signedPct(r);
                },
                (s) => {
                  const r = retOf(closesOf(s.symbol), 30);
                  return r == null ? '' : r < 0 ? 'down' : 'up';
                }
              )}
              {metric('30-day volatility', (s) => {
                const v = volOf(closesOf(s.symbol));
                return v == null ? '·' : v.toFixed(1) + '%';
              })}
              {metric('Range position', (s) => {
                const rp = rangePosOf(closesOf(s.symbol));
                if (!rp) return '·';
                return (
                  <span className="range-wrap" title={rp.n + ' sessions'}>
                    <span className="range-bar">
                      <span className="range-fill" style={{ width: rp.pct.toFixed(0) + '%' }} />
                      <span className="range-dot" style={{ left: rp.pct.toFixed(0) + '%' }} />
                    </span>
                    <span className="range-pct">{rp.pct.toFixed(0)}%</span>
                  </span>
                );
              })}
              {metric('Dividend yield', (s) => {
                const tot = divYield[s.symbol.toUpperCase()];
                if (!(tot > 0) || !(s.current_price > 0)) return '·';
                return ((tot / s.current_price) * 100).toFixed(2) + '%';
              })}
              {metric(
                'vs ASI (30d)',
                (s) => {
                  const sr = retOf(closesOf(s.symbol), 30);
                  const ar = asiRet(30);
                  if (sr == null || ar == null) return '·';
                  return signedPct(sr - ar);
                },
                (s) => {
                  const sr = retOf(closesOf(s.symbol), 30);
                  const ar = asiRet(30);
                  if (sr == null || ar == null) return '';
                  return sr - ar < 0 ? 'down' : 'up';
                }
              )}
              {metric('Value traded', (s) => {
                const vol = s.volume || 0;
                if (!(s.current_price > 0) || !(vol > 0)) return '·';
                return fmtMcap(s.current_price * vol);
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="pc-note">
          {live ? 'Live from the latest market feed.' : 'Showing the latest snapshot.'} Information only, not
          investment advice.{' '}
          <button type="button" className="btn-ghost btn-sm" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy share link'}
          </button>
        </p>
      )}
    </div>
  );
}
