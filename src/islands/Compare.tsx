import React, { useEffect, useMemo, useState } from 'react';
import { getJSON, fmt2, signedPct, esc } from '../lib/api.js';
import type { ApiStock, PricesResponse } from '../lib/types.js';

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
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="pc-note">
          {live ? 'Live from the latest market feed.' : 'Showing the latest snapshot.'} Information only, not
          investment advice.
        </p>
      )}
    </div>
  );
}
