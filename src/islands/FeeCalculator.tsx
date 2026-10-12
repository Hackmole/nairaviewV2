import { useState } from 'react';

/* Fee calculator: true cost of an NGX buy or sell order.
   Render-style island — owns #feeCalc contents.
   Fees (NGX schedule, verified Oct 2026):
   - Brokerage: user commission c% (0.75–1.35) + 7.5% VAT on the commission
   - Buy:  SEC fee 0.3% + 7.5% VAT  (= 0.3225% effective)
   - Sell: NGX fee 0.3% + 7.5% VAT; CSCS fee 0.3% + 7.5% VAT
   - Both: stamp duty 0.075%; trade alert ₦4 per transaction
*/

const VAT = 0.075;

function fmtN(n: number): string {
  return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FeeCalculator(): React.JSX.Element {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [value, setValue] = useState<string>('100000');
  const [comm, setComm] = useState<number>(1.35);

  const v = Math.max(0, parseFloat(value.replace(/[^0-9.]/g, '')) || 0);
  const c = comm / 100;
  const brokerage = v * c * (1 + VAT);
  const stamp = v * 0.00075;
  const alert = v > 0 ? 4 : 0;

  let lines: Array<[string, number]> = [];
  let total: number;
  let totalLabel: string;
  if (side === 'buy') {
    const sec = v * 0.003 * (1 + VAT);
    lines = [
      ['Shares', v],
      [`Brokerage (${comm.toFixed(2)}% + VAT)`, brokerage],
      ['SEC fee (0.3% + VAT)', sec],
      ['Stamp duty (0.075%)', stamp],
      ['Trade alert', alert],
    ];
    total = v + brokerage + sec + stamp + alert;
    totalLabel = 'Total cost to you';
  } else {
    const ngx = v * 0.003 * (1 + VAT);
    const cscs = v * 0.003 * (1 + VAT);
    lines = [
      ['Sale value', v],
      [`Brokerage (${comm.toFixed(2)}% + VAT)`, -brokerage],
      ['NGX fee (0.3% + VAT)', -ngx],
      ['CSCS fee (0.3% + VAT)', -cscs],
      ['Stamp duty (0.075%)', -stamp],
      ['Trade alert', -alert],
    ];
    total = v - brokerage - ngx - cscs - stamp - alert;
    totalLabel = 'Net proceeds to you';
  }

  return (
    <div className="calc-wrap">
      <div className="calc-row">
        <div className="calc-toggle" role="group" aria-label="Order side">
          <button type="button" aria-pressed={side === 'buy' ? 'true' : 'false'} onClick={() => setSide('buy')}>Buy</button>
          <button type="button" aria-pressed={side === 'sell' ? 'true' : 'false'} onClick={() => setSide('sell')}>Sell</button>
        </div>
      </div>
      <div className="calc-row">
        <div className="calc-field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="feeValue">Trade value (₦)</label>
          <input id="feeValue" type="text" inputMode="decimal" value={value}
            onChange={(e) => setValue(e.target.value)} placeholder="100000" />
        </div>
        <div className="calc-field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="feeComm">Broker commission: {comm.toFixed(2)}%</label>
          <input id="feeComm" type="range" min={0.75} max={1.35} step={0.01} value={comm}
            onChange={(e) => setComm(parseFloat(e.target.value))} aria-label="Broker commission percent" />
        </div>
      </div>
      <table className="calc-out">
        <tbody>
          {lines.map(([label, amt]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{amt < 0 ? '−' + fmtN(-amt) : fmtN(amt)}</td>
            </tr>
          ))}
          <tr className="calc-total">
            <td>{totalLabel}</td>
            <td>{fmtN(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
