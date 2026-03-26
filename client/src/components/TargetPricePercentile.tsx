import React, { useState } from 'react';
import { Target } from 'lucide-react';
import { ForecastHorizon } from '../api';
import { computeTargetPercentile } from '../utils/percentile';

interface Props {
  horizons: ForecastHorizon[];
  spot: number;
  onTargetPriceChange?: (price: number | null) => void;
}

function formatTargetDate(dateStr: string | null, days: number): string {
  if (!dateStr) return `${days}d`;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const mon = date.toLocaleString('en-US', { month: 'short' });
  return `Fri ${mon} ${d} (${days}d)`;
}

function percentileColor(pct: number): string {
  if (pct <= 50) return 'text-green-400';
  if (pct <= 68) return 'text-yellow-400';
  if (pct <= 90) return 'text-orange-400';
  return 'text-red-400';
}

export default function TargetPricePercentile({ horizons, spot, onTargetPriceChange }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [targetPrice, setTargetPrice] = useState<number | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setTargetPrice(num);
      onTargetPriceChange?.(num);
    } else {
      setTargetPrice(null);
      onTargetPriceChange?.(null);
    }
  };

  const results = targetPrice
    ? horizons.map((h) => ({
        horizon: h,
        ...computeTargetPercentile(targetPrice, h.center, h.expectedMove),
      }))
    : null;

  return (
    <div className="bg-surface-card border border-edge rounded-lg p-5">
      <h3 className="text-sm font-medium text-dim mb-3 flex items-center gap-2">
        <Target className="w-4 h-4" />
        Target Price Percentile Lookup
      </h3>
      <p className="text-xs text-dim mb-3">
        Enter a price target to see what percentile band it falls at for each horizon.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dim text-sm">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={spot.toFixed(2)}
            className="w-40 pl-7 pr-3 py-2 bg-surface border border-edge rounded-lg text-sm font-mono focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        {targetPrice && (
          <span className="text-xs text-dim">
            {targetPrice > spot
              ? `+$${(targetPrice - spot).toFixed(2)} (+${(((targetPrice - spot) / spot) * 100).toFixed(1)}%) above spot`
              : targetPrice < spot
              ? `-$${(spot - targetPrice).toFixed(2)} (-${(((spot - targetPrice) / spot) * 100).toFixed(1)}%) below spot`
              : 'at spot'}
          </span>
        )}
      </div>

      {results && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-dim text-left">
                <th className="py-2 px-3 font-medium">Horizon</th>
                <th className="py-2 px-3 font-medium text-right cursor-help" title="Number of standard deviations the target price is from the forecast center. Higher sigma = further into the tails of the distribution.">Sigma</th>
                <th className="py-2 px-3 font-medium text-right cursor-help" title="Two-sided percentile: the probability that the stock price stays within this distance of the forecast center. For reference: 50% band = 0.67σ, 68% band = 1.00σ, 90% band = 1.80σ.">Band %ile</th>
                <th className="py-2 px-3 font-medium text-center cursor-help" title="Whether the target price is above or below the forecast center for this horizon.">Side</th>
                <th className="py-2 px-3 font-medium text-right cursor-help" title="One-tailed probability: the chance that the price reaches or exceeds the target on the given side. E.g., if target is above center, this is P(price ≥ target).">P(reach)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.horizon.horizon} className="border-b border-edge/50 hover:bg-surface-hover transition-colors">
                  <td className="py-2 px-3 font-semibold text-accent">
                    {formatTargetDate(r.horizon.targetDate, r.horizon.horizonDays)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {r.sigma.toFixed(2)}σ
                  </td>
                  <td className={`py-2 px-3 text-right font-mono font-medium ${percentileColor(r.percentile)}`}>
                    {r.percentile.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={r.side === 'above' ? 'text-green-400' : r.side === 'below' ? 'text-red-400' : 'text-gray-400'}>
                      {r.side === 'above' ? '↑ above' : r.side === 'below' ? '↓ below' : '— center'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono">
                    {r.probBeyond.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-xs text-dim space-y-1">
            <p><strong>Band %ile</strong> — probability the price stays within ±{targetPrice && results[0] ? `$${Math.abs(targetPrice - results[0].horizon.center).toFixed(2)}` : '...'} of the forecast center. Compare: 50% band, 68% band, 90% band.</p>
            <p><strong>P(reach)</strong> — chance of the price reaching ${targetPrice?.toFixed(2)} or beyond on that side.</p>
          </div>
        </div>
      )}
    </div>
  );
}
