import React, { useState } from 'react';
import { Search, TrendingUp, Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { fetchForecast, ForecastResult } from '../api';
import ForecastTable from './ForecastTable';
import ForecastConeChart from './ForecastConeChart';
import ForecastDetails from './ForecastDetails';

type ViewTab = 'all' | '1' | '2' | '3' | '4';

export default function ForecastSection() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [showDetails, setShowDetails] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTicker = ticker.trim().toUpperCase();
    if (!cleanTicker) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await fetchForecast(cleanTicker);
      setResult(data);
      setActiveTab('all');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch forecast');
    } finally {
      setLoading(false);
    }
  };

  const filteredHorizons = result
    ? activeTab === 'all'
      ? result.horizons
      : result.horizons.filter(h => h.horizonWeeks === Number(activeTab))
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <TrendingUp className="w-8 h-8 text-accent" />
        <div>
          <h1 className="text-2xl font-bold">Stock Price Range Forecast</h1>
          <p className="text-dim text-sm">1-4 week forecast using IV + ATR + Realized Volatility blending</p>
        </div>
      </div>

      {/* Ticker Input */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter ticker (e.g. AAPL, NVDA, TSLA)"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-card border border-edge rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
              maxLength={10}
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !ticker.trim()}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Forecasting...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4" />
                Forecast
              </>
            )}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Result Header */}
          <div className="bg-surface-card border border-edge rounded-lg p-5">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <span className="text-2xl font-bold text-accent">{result.ticker}</span>
                <span className="text-dim text-sm ml-3">Spot ${result.spot.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-dim">
                  IV: {result.ivAvailable ? (
                    <span className="text-green-400">Available ({result.ivExpirations} expirations)</span>
                  ) : (
                    <span className="text-yellow-400">Unavailable (ATR+RV fallback)</span>
                  )}
                </span>
                <span className="text-dim">
                  Trend: <span className={result.trendScore > 0.1 ? 'text-green-400' : result.trendScore < -0.1 ? 'text-red-400' : 'text-gray-400'}>
                    {result.trendScore > 0 ? '+' : ''}{(result.trendScore * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="text-dim">Bars: {result.dataPoints}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-dim">
              <span>EMA20: ${result.indicators.ema20?.toFixed(2)}</span>
              <span>SMA50: ${result.indicators.sma50?.toFixed(2)}</span>
              <span>RSI: {result.indicators.rsi14?.toFixed(1)}</span>
              <span>ATR14: ${result.indicators.atr14?.toFixed(2)}</span>
              <span>RV(20d): {result.indicators.rv20Daily ? (result.indicators.rv20Daily * 100).toFixed(2) + '%' : 'N/A'}</span>
            </div>
            <div className="mt-1 text-xs text-dim">
              Generated {new Date(result.generatedAt).toLocaleString()}
            </div>
          </div>

          {/* Horizon Tabs */}
          <div className="flex gap-2 flex-wrap">
            {(['all', '1', '2', '3', '4'] as ViewTab[]).map(tab => {
              let label = 'All Horizons';
              if (tab !== 'all') {
                const h = result.horizons.find(h => h.horizonWeeks === Number(tab));
                if (h?.targetDate) {
                  const [y, m, d] = h.targetDate.split('-').map(Number);
                  const date = new Date(y, m - 1, d);
                  const mon = date.toLocaleString('en-US', { month: 'short' });
                  label = `Fri ${mon} ${d} (${h.horizonDays}d)`;
                } else {
                  label = `${tab}W`;
                }
              }
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-accent text-white'
                      : 'bg-surface-card text-dim hover:text-white hover:bg-surface-hover border border-edge'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Cone Chart */}
          <div className="bg-surface-card border border-edge rounded-lg p-5">
            <h3 className="text-sm font-medium text-dim mb-4">Forecast Cone</h3>
            <ForecastConeChart horizons={result.horizons} spot={result.spot} />
            <div className="flex justify-center gap-6 mt-3 text-xs text-dim">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-accent/40 inline-block" /> 50% band
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-accent/25 inline-block" /> 68% band
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-accent/15 inline-block" /> 90% band
              </span>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-surface-card border border-edge rounded-lg overflow-hidden">
            <ForecastTable horizons={filteredHorizons} spot={result.spot} />
          </div>

          {/* Calculation Details Toggle */}
          <div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-surface-card text-dim hover:text-white hover:bg-surface-hover border border-edge"
            >
              {showDetails ? 'Hide' : 'Show'} Calculation Details
            </button>
          </div>

          {/* Calculation Details */}
          {showDetails && (
            <div className="bg-surface-card border border-edge rounded-lg p-5">
              <h3 className="text-sm font-medium text-dim mb-4">
                Intermediate Calculations — {(() => {
                  const h = activeTab === 'all' ? result.horizons[0] : result.horizons.find(h => h.horizonWeeks === Number(activeTab)) || result.horizons[0];
                  if (h?.targetDate) {
                    const [y, m, d] = h.targetDate.split('-').map(Number);
                    const date = new Date(y, m - 1, d);
                    const mon = date.toLocaleString('en-US', { month: 'short' });
                    return `Fri ${mon} ${d}`;
                  }
                  return activeTab === 'all' ? '1W' : `${activeTab}W`;
                })()}
              </h3>
              <ForecastDetails
                result={result}
                selectedHorizon={
                  activeTab === 'all'
                    ? result.horizons[0]
                    : result.horizons.find(h => h.horizonWeeks === Number(activeTab)) || result.horizons[0]
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
