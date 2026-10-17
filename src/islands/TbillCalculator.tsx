import { useEffect, useState } from 'react';
import { getJSON } from '../lib/api.js';

/* T-bill earnings calculator (render-style island).
   Discount-yield math, actual/365 day count:
     face F = P / (1 - r*t/365); gross interest = F - P;
     10% WHT on the interest (FIRS directive, Oct 2025); net = gross * 0.9.
   Rates + tax assumption come from assets/fixed-income.json.
   Static HTML inside the mount stays as the no-JS fallback. */

interface FiDoc {
  as_of: string;
  ntb_latest: { date: string; rates: Record<string, number> };
  savings_bonds: { offer: string; tenors: Array<{ tenor: string; coupon: number }> };
  tax?: { tbill_wht: number };
}

const TENORS = [
  { key: '91d', label: '91-day', days: 91 },
  { key: '182d', label: '182-day', days: 182 },
  { key: '364d', label: '364-day', days: 364 },
] as const;

function fmtN(n: number): string {
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return Number(m[3]) + ' ' + M[Number(m[2]) - 1] + ' ' + m[1];
}
function addDays(iso: string, days: number): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return fmtDate(d.toISOString().slice(0, 10));
}

export default function TbillCalculator(): React.JSX.Element {
  const [doc, setDoc] = useState<FiDoc | null>(null);
  const [amount, setAmount] = useState<string>('500000');
  const [tenor, setTenor] = useState<(typeof TENORS)[number]>(TENORS[2]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getJSON<FiDoc>('assets/fixed-income.json?v=20261017a')
      .then((d) => { if (alive) setDoc(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (!doc) {
    if (failed) {
      return (
        <div>
          <p className="lab-note">The live calculator could not load the latest rates. The short version: at the 15.90% stop rate, ₦1,000,000 invested for 364 days buys ₦1,188,445 of face value. Gross interest ₦188,445, less 10% withholding tax (₦18,845), leaves ₦169,601 net, a 17.01% annualised yield.</p>
          <p className="lab-note">Try reloading the page for the interactive version.</p>
        </div>
      );
    }
    return <p className="lab-note">Loading the latest auction rates…</p>;
  }

  const P = Math.max(0, parseFloat(amount.replace(/[^0-9.]/g, '')) || 0);
  const r = (doc.ntb_latest.rates[tenor.key] ?? 0) / 100;
  const wht = doc.tax?.tbill_wht ?? 0.10;
  const t = tenor.days;

  const d = r * t / 365;
  const F = d >= 1 ? 0 : P / (1 - d);
  const gross = F - P;
  const tax = gross * wht;
  const net = gross - tax;
  const netYield = P > 0 ? (net / P) * (365 / t) * 100 : 0;
  const maturity = addDays(doc.ntb_latest.date, t);

  const rows: Array<[string, string, boolean?]> = [
    ['You pay now', fmtN(P), false],
    ['Face value at maturity', fmtN(F), false],
    ['Gross interest', fmtN(gross), false],
    [`Withholding tax (${(wht * 100).toFixed(0)}%)`, '−' + fmtN(tax), false],
    ['Net interest to you', fmtN(net), true],
    ['Net annualised yield', netYield.toFixed(2) + '%', true],
  ];

  const sb = doc.savings_bonds.tenors;
  const cmp: Array<[string, string, string]> = [
    [`${tenor.label} T-bill`, (r * 100).toFixed(2) + '% stop rate', `${(wht * 100).toFixed(0)}% WHT`],
    ...sb.map((s): [string, string, string] => [s.tenor + ' savings bond', s.coupon.toFixed(3) + '% coupon', 'Exempt']),
  ];

  return (
    <div className="calc-wrap">
      <div className="calc-row">
        <div className="calc-field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="tbAmount">Amount to invest (₦)</label>
          <input id="tbAmount" type="text" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="500000" />
        </div>
        <div className="calc-field">
          <span className="calc-label" id="tbTenorLabel">Tenor</span>
          <div className="calc-toggle" role="group" aria-labelledby="tbTenorLabel">
            {TENORS.map((tn) => (
              <button key={tn.key} type="button"
                aria-pressed={tenor.key === tn.key ? 'true' : 'false'}
                onClick={() => setTenor(tn)}>{tn.label}</button>
            ))}
          </div>
        </div>
      </div>
      <table className="calc-out tb-xfade" key={tenor + ':' + amount}>
        <tbody>
          {rows.map(([k, v, hi]) => (
            <tr key={k} className={hi ? 'calc-total' : ''}><th scope="row">{k}</th><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="lab-note">
        Matures {maturity} · {tenor.label} stop rate {(r * 100).toFixed(2)}% (auction of {fmtDate(doc.ntb_latest.date)}) ·
        discount pricing, actual/365 day count.
      </p>
      <p className="lab-note">
        The {(wht * 100).toFixed(0)}% withholding tax follows the FIRS directive of October 2025 (deducted at source;
        investors receive tax credits). FGN bond interest remains exempt.
      </p>
      <h3 className="guide-h3">After-tax, side by side</h3>
      <div className="movers-col"><table className="movers-table">
        <thead><tr><th>Product</th><th>Rate</th><th>Tax on interest</th></tr></thead>
        <tbody>
          {cmp.map(([a, b, c]) => (
            <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>
          ))}
        </tbody>
      </table></div>
      <p className="lab-note">Savings bond coupons shown gross; paid quarterly. Figures as of {fmtDate(doc.as_of)}.</p>
    </div>
  );
}
