import React from 'react';
import { CreditSpreadRow, CreditSpreadCell } from '../api';

interface Props {
  rows: CreditSpreadRow[];
  type: 'put' | 'call';
  spreadWidth: number;
}

function formatTargetDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const mon = date.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${d}`;
}

function SpreadCell({ cell, type }: { cell: CreditSpreadCell | null | undefined; type: 'put' | 'call' }) {
  if (!cell) {
    return <span className="text-dim text-xs">N/A</span>;
  }

  const sellLabel = type === 'put' ? 'Sell P' : 'Sell C';
  const buyLabel = type === 'put' ? 'Buy P' : 'Buy C';
  const premiumColor = cell.premium > 0 ? 'text-green-400' : 'text-dim';

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="text-xs text-dim">
        {sellLabel} ${cell.sellStrike} / {buyLabel} ${cell.buyStrike}
      </div>
      <div className={`font-mono font-medium ${premiumColor}`}>
        ${cell.premiumPerContract}
      </div>
    </div>
  );
}

export default function CreditSpreadTable({ rows, type, spreadWidth }: Props) {
  const title = type === 'put' ? 'Sell Put Credit Spread' : 'Sell Call Credit Spread';
  const subtitle = type === 'put'
    ? `Sell put just OTM below range low, buy put $${spreadWidth} lower`
    : `Sell call just OTM above range high, buy call $${spreadWidth} higher`;

  return (
    <div className="overflow-x-auto">
      <div className="px-4 py-3 border-b border-edge">
        <h3 className="text-sm font-semibold text-accent">{title}</h3>
        <p className="text-xs text-dim mt-0.5">{subtitle}</p>
      </div>
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '22.67%' }} />
          <col style={{ width: '22.67%' }} />
          <col style={{ width: '22.67%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-edge text-dim text-left">
            <th className="py-3 px-4 font-medium">Horizon</th>
            <th className="py-3 px-4 font-medium text-right">Expected Move</th>
            <th className="py-3 px-4 font-medium text-right cursor-help" title="Credit spread strikes and net premium for the 50% probability range boundary. Higher premium but ~25% breach risk per side.">
              Range 50%
            </th>
            <th className="py-3 px-4 font-medium text-right cursor-help" title="Credit spread strikes and net premium for the 68% probability range boundary. Balanced risk/reward with ~16% breach risk per side.">
              Range 68%
            </th>
            <th className="py-3 px-4 font-medium text-right cursor-help" title="Credit spread strikes and net premium for the 90% probability range boundary. Conservative with ~5% breach risk per side.">
              Range 90%
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.horizon} className="border-b border-edge/50 hover:bg-surface-hover transition-colors">
              <td className="py-3 px-4 font-semibold text-accent">
                {row.targetDate ? (
                  <>
                    Fri {formatTargetDate(row.targetDate)}
                    <span className="text-dim text-xs ml-1.5 font-normal">
                      ({row.horizonDays}d)
                    </span>
                  </>
                ) : (
                  row.horizon
                )}
              </td>
              <td className="py-3 px-4 text-right">
                <span className="font-mono">${row.expectedMove.toFixed(2)}</span>
                <span className="text-dim ml-1">({row.expectedMovePct.toFixed(1)}%)</span>
              </td>
              <td className="py-3 px-4 text-right">
                <SpreadCell cell={row.ranges.range50} type={type} />
              </td>
              <td className="py-3 px-4 text-right">
                <SpreadCell cell={row.ranges.range68} type={type} />
              </td>
              <td className="py-3 px-4 text-right">
                <SpreadCell cell={row.ranges.range90} type={type} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
