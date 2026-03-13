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
            <th className="py-3 px-4 font-medium cursor-help" title="Target expiration date and number of calendar days until that date. Each horizon aligns to the next weekly options expiry (Friday).">Horizon</th>
            <th className="py-3 px-4 font-medium text-right cursor-help" title="Predicted price movement (±) from current spot price, shown in dollars and as a percentage. Derived from the blended volatility estimate (IV + ATR + RV) scaled to the horizon length.">Expected Move</th>
            <th className="py-3 px-4 font-medium text-right cursor-help" title="Price range that has a 50% probability of containing the stock price at expiration. Equivalent to roughly ±0.67 standard deviations from the forecast center.">Range 50%</th>
            <th className="py-3 px-4 font-medium text-right cursor-help" title="Price range that has a 68% probability of containing the stock price at expiration. Equivalent to ±1 standard deviation — the classic 'one-sigma' move.">Range 68%</th>
            <th className="py-3 px-4 font-medium text-right cursor-help" title="Price range that has a 90% probability of containing the stock price at expiration. Equivalent to roughly ±1.65 standard deviations. Useful for identifying extreme support/resistance levels.">Range 90%</th>
            <th className="py-3 px-4 font-medium text-center cursor-help" title="Directional bias of the forecast based on the trend score. Bullish/bearish indicates the forecast center is shifted above/below the current spot price. Neutral means minimal directional bias.">Skew</th>
            <th className="py-3 px-4 font-medium text-center cursor-help" title="Confidence score (0-100%) reflecting data quality: how many volatility sources are available (IV, ATR, RV), agreement between them, and whether options data is present. Higher = more reliable forecast.">Confidence</th>
            <th className="py-3 px-4 font-medium text-center cursor-help" title="Whether implied volatility (IV) data from options was available and used for this horizon. YES = IV-informed forecast, N/A = forecast relies only on ATR + realized volatility.">IV</th>
          </tr>
        </thead>
        <tbody>
          {horizons.map((h) => (
            <tr key={h.horizon} className="border-b border-edge/50 hover:bg-surface-hover transition-colors">
              <td className="py-3 px-4 font-semibold text-accent">
                {h.targetDate ? (
                  <>
                    Fri {formatTargetDate(h.targetDate)}
                    <span className="text-dim text-xs ml-1.5 font-normal">
                      ({h.horizonDays}d)
                    </span>
                  </>
                ) : (
                  h.horizon
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
