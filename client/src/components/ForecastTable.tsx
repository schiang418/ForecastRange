import React from 'react';
import { ForecastHorizon } from '../api';

interface Props {
  horizons: ForecastHorizon[];
  spot: number;
}

function skewColor(skew: string) {
  if (skew.includes('bullish')) return 'text-green-400';
  if (skew.includes('bearish')) return 'text-red-400';
  return 'text-gray-400';
}

function confidenceColor(label: string) {
  if (label === 'high') return 'text-green-400';
  if (label === 'medium-high') return 'text-blue-400';
  if (label === 'medium') return 'text-yellow-400';
  return 'text-red-400';
}

function formatTargetDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const mon = date.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${d}`;
}

export default function ForecastTable({ horizons, spot }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge text-dim text-left">
            <th className="py-3 px-4 font-medium">Horizon</th>
            <th className="py-3 px-4 font-medium text-right">Expected Move</th>
            <th className="py-3 px-4 font-medium text-right">Range 50%</th>
            <th className="py-3 px-4 font-medium text-right">Range 68%</th>
            <th className="py-3 px-4 font-medium text-right">Range 90%</th>
            <th className="py-3 px-4 font-medium text-center">Skew</th>
            <th className="py-3 px-4 font-medium text-center">Confidence</th>
            <th className="py-3 px-4 font-medium text-center">IV</th>
          </tr>
        </thead>
        <tbody>
          {horizons.map((h) => (
            <tr key={h.horizon} className="border-b border-edge/50 hover:bg-surface-hover transition-colors">
              <td className="py-3 px-4 font-semibold text-accent">
                {h.horizon}
                {h.targetDate && (
                  <span className="text-dim text-xs ml-1.5 font-normal">
                    Fri {formatTargetDate(h.targetDate)}
                  </span>
                )}
              </td>
              <td className="py-3 px-4 text-right">
                <span className="font-mono">${h.expectedMove.toFixed(2)}</span>
                <span className="text-dim ml-1">({h.expectedMovePct.toFixed(1)}%)</span>
              </td>
              <td className="py-3 px-4 text-right font-mono">
                ${h.range50.low.toFixed(2)} — ${h.range50.high.toFixed(2)}
              </td>
              <td className="py-3 px-4 text-right font-mono">
                ${h.range68.low.toFixed(2)} — ${h.range68.high.toFixed(2)}
              </td>
              <td className="py-3 px-4 text-right font-mono">
                ${h.range90.low.toFixed(2)} — ${h.range90.high.toFixed(2)}
              </td>
              <td className={`py-3 px-4 text-center font-medium ${skewColor(h.skew)}`}>
                {h.skew}
              </td>
              <td className={`py-3 px-4 text-center font-medium ${confidenceColor(h.confidenceLabel)}`}>
                {(h.confidence * 100).toFixed(0)}%
                <span className="text-xs ml-1 opacity-70">({h.confidenceLabel})</span>
              </td>
              <td className="py-3 px-4 text-center">
                {h.ivAvailable ? (
                  <span className="text-green-400 text-xs">YES</span>
                ) : (
                  <span className="text-dim text-xs">N/A</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
