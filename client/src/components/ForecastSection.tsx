import React, { useState } from 'react';
import { Search, TrendingUp, Loader2, AlertCircle, BarChart3, Download, Scissors } from 'lucide-react';
import { fetchForecast, fetchSpreadAnalysis, fetchPremiumAwareSpreadAnalysis, fetchCreditSpreads, ForecastResult, CreditSpreadPricingResult } from '../api';
import ForecastTable from './ForecastTable';
import ForecastConeChart from './ForecastConeChart';
import ForecastDetails from './ForecastDetails';
import PriceHistoryChart from './PriceHistoryChart';
import UpcomingEvents from './UpcomingEvents';
import PremiumChecklist from './PremiumChecklist';
import CreditSpreadTable from './CreditSpreadTable';
import TargetPricePercentile from './TargetPricePercentile';
import { downloadForecastMarkdown, downloadAnalysisMarkdown } from '../exportMarkdown';

type ViewTab = 'all' | '1' | '2' | '3' | '4';

export default function ForecastSection() {
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [showDetails, setShowDetails] = useState(false);
  const [spreadAnalysis, setSpreadAnalysis] = useState<string | null>(null);
  const [spreadLoading, setSpreadLoading] = useState(false);
  const [spreadError, setSpreadError] = useState<string | null>(null);
  const [creditSpreads, setCreditSpreads] = useState<CreditSpreadPricingResult | null>(null);
  const [creditSpreadsLoading, setCreditSpreadsLoading] = useState(false);
  const [creditSpreadsError, setCreditSpreadsError] = useState<string | null>(null);
  const [premiumAnalysis, setPremiumAnalysis] = useState<string | null>(null);
  const [premiumAnalysisLoading, setPremiumAnalysisLoading] = useState(false);
  const [premiumAnalysisError, setPremiumAnalysisError] = useState<string | null>(null);
  const [targetPrice, setTargetPrice] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTicker = ticker.trim().toUpperCase();
    if (!cleanTicker) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSpreadAnalysis(null);
    setSpreadError(null);
    setCreditSpreads(null);
    setCreditSpreadsError(null);
    setPremiumAnalysis(null);
    setPremiumAnalysisError(null);
    setTargetPrice(null);

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

  const handleSpreadAnalysis = async () => {
    if (!result) return;
    setSpreadLoading(true);
    setSpreadError(null);
    try {
      const analysis = await fetchSpreadAnalysis(result);
      setSpreadAnalysis(analysis);
    } catch (err: any) {
      setSpreadError(err.message || 'Failed to generate spread analysis');
    } finally {
      setSpreadLoading(false);
    }
  };

  const handleCreditSpreads = async () => {
    if (!result) return;
    setCreditSpreadsLoading(true);
    setCreditSpreadsError(null);
    try {
      const data = await fetchCreditSpreads(result.ticker, result.horizons, result.spot);
      setCreditSpreads(data);
    } catch (err: any) {
      setCreditSpreadsError(err.message || 'Failed to fetch credit spreads');
    } finally {
      setCreditSpreadsLoading(false);
    }
  };

  const handlePremiumAwareAnalysis = async () => {
    if (!result) return;
    setPremiumAnalysisLoading(true);
    setPremiumAnalysisError(null);
    try {
      // Fetch credit spreads first if not already loaded
      let spreads = creditSpreads;
      if (!spreads) {
        spreads = await fetchCreditSpreads(result.ticker, result.horizons, result.spot);
        setCreditSpreads(spreads);
      }
      const analysis = await fetchPremiumAwareSpreadAnalysis(result, spreads);
      setPremiumAnalysis(analysis);
    } catch (err: any) {
      setPremiumAnalysisError(err.message || 'Failed to generate premium-aware analysis');
    } finally {
      setPremiumAnalysisLoading(false);
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

      {/* Target Price Percentile Lookup - shown when forecast results are available */}
      {result && (
        <div className="mb-8">
          <TargetPricePercentile
            horizons={result.horizons}
            spot={result.spot}
            onTargetPriceChange={setTargetPrice}
          />
        </div>
      )}

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
                <span className="text-dim text-sm ml-3 cursor-help" title="Current stock price (last close from daily OHLCV bars)">Spot ${result.spot.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-dim cursor-help" title="Options data source used for forecasting. Straddle = ATM call+put mid prices (best). IV = implied volatility from options chain. Unavailable = forecast uses only ATR + RV.">
                  Options: {result.straddleAvailable ? (
                    <span className="text-green-400">Straddle ({result.straddleExpirations} exp)</span>
                  ) : result.ivAvailable ? (
                    <span className="text-blue-400">IV ({result.ivExpirations} exp)</span>
                  ) : (
                    <span className="text-yellow-400">Unavailable (ATR+RV fallback)</span>
                  )}
                </span>
                <span className="text-dim cursor-help" title="Weighted trend score (-100% to +100%) from EMA20 slope (35%), EMA50 slope (25%), MACD histogram (20%), and RSI regime (20%). Shifts the forecast center up or down.">
                  Trend: <span className={result.trendScore > 0.1 ? 'text-green-400' : result.trendScore < -0.1 ? 'text-red-400' : 'text-gray-400'}>
                    {result.trendScore > 0 ? '+' : ''}{(result.trendScore * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="text-dim cursor-help" title="Number of daily OHLCV bars used for indicator calculations. More bars = more reliable trend and volatility estimates.">Bars: {result.dataPoints}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-dim">
              <span className="cursor-help" title="20-day Exponential Moving Average. Price above EMA20 = short-term bullish, below = bearish.">EMA20: ${result.indicators.ema20?.toFixed(2)}</span>
              <span className="cursor-help" title="50-day Simple Moving Average. Major trend indicator — price above SMA50 = medium-term uptrend.">SMA50: ${result.indicators.sma50?.toFixed(2)}</span>
              <span className="cursor-help" title="14-day Relative Strength Index (0-100). >70 = overbought, <30 = oversold, 50 = neutral.">RSI: {result.indicators.rsi14?.toFixed(1)}</span>
              <span className="cursor-help" title="14-day Average True Range. Measures average daily price movement in dollars. Used as a volatility component in the forecast blend.">ATR14: ${result.indicators.atr14?.toFixed(2)}</span>
              <span className="cursor-help" title="20-day realized volatility (daily sigma). Measures actual historical price movement. Annualized by multiplying by √252.">RV(20d): {result.indicators.rv20Daily ? (result.indicators.rv20Daily * 100).toFixed(2) + '%' : 'N/A'}</span>
            </div>
            <div className="mt-1 text-xs text-dim">
              Generated {new Date(result.generatedAt).toLocaleString()}
            </div>
          </div>

          {/* Volatility / Premium Quality Panel */}
          {(() => {
            const vm = result.volatilityMetrics;
            const premiumColor = vm.premiumLabel === 'rich' ? 'text-green-400'
              : vm.premiumLabel === 'moderately attractive' ? 'text-blue-400'
              : vm.premiumLabel === 'neutral' ? 'text-yellow-400'
              : vm.premiumLabel === 'cheap' ? 'text-red-400' : 'text-dim';
            const regimeColor = vm.regime === 'extreme' ? 'text-red-400'
              : vm.regime === 'elevated' ? 'text-orange-400'
              : vm.regime === 'normal' ? 'text-gray-400'
              : vm.regime === 'compressed' ? 'text-blue-400' : 'text-dim';
            return (
              <div className="bg-surface-card border border-edge rounded-lg p-5">
                <h3 className="text-sm font-medium text-dim mb-3">Volatility / Premium Quality</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* IV & RV */}
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title="Annualized implied volatility from nearest ATM options expiration. Represents the market's expectation of future volatility.">Current IV</div>
                    <div className="text-lg font-mono font-medium">
                      {vm.currentIVPct != null ? `${vm.currentIVPct.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title="20-day realized volatility annualized (daily sigma × √252). Measures how much the stock has actually moved recently.">RV(20d) Annualized</div>
                    <div className="text-lg font-mono font-medium">{vm.rv20AnnualizedPct.toFixed(1)}%</div>
                  </div>
                  {/* IV/RV Ratio */}
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title="IV divided by RV. >1.3x = premium rich (good for selling), <1.0x = premium cheap (options underpriced). Shows how much the market overestimates realized movement.">IV / RV Ratio</div>
                    <div className={`text-lg font-mono font-medium ${vm.ivRvRatio != null && vm.ivRvRatio >= 1.3 ? 'text-green-400' : vm.ivRvRatio != null && vm.ivRvRatio < 1.0 ? 'text-red-400' : ''}`}>
                      {vm.ivRvRatio != null ? `${vm.ivRvRatio.toFixed(2)}x` : 'N/A'}
                    </div>
                    {vm.volPremium != null && (
                      <div className="text-xs text-dim mt-0.5">
                        premium: {vm.volPremium > 0 ? '+' : ''}{vm.volPremium.toFixed(1)}pp
                      </div>
                    )}
                  </div>
                  {/* Regime */}
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title="Volatility regime based on current RV vs median historical RV, adjusted by IV percentile when available. Extreme: RV >2x median, Elevated: >1.5x, Normal: 0.8-1.5x, Compressed: <0.8x. If RV is compressed but IV pctl ≥70%, regime upgrades to Normal (market expects vol expansion).">Vol Regime</div>
                    <div className={`text-lg font-medium capitalize ${regimeColor}`}>{vm.regime}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  {/* IV Percentile */}
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title={vm.ivPercentileSource === 'iv_history'
                      ? `Percentage of ${vm.ivHistoryDays} historical IV snapshots below current IV. True IV percentile from stored daily data. ≥75% is attractive for premium selling.`
                      : `Percentage of historical RV values below current IV (RV approximation — ${vm.ivHistoryDays < 30 ? vm.ivHistoryDays + '/30' : '0'} IV snapshots collected). Will switch to true IV percentile after 30 daily snapshots.`
                    }>
                      IV Percentile ({vm.ivPercentileSource === 'iv_history' ? `${vm.ivHistoryDays}d` : `${vm.rvHistoryDays}d`})
                      {vm.ivPercentileSource === 'rv_approximation' && <span className="text-yellow-400 ml-1" title="Using RV-based approximation — collecting IV history">~</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${vm.ivPercentile != null && vm.ivPercentile >= 75 ? 'bg-green-500' : vm.ivPercentile != null && vm.ivPercentile >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${vm.ivPercentile ?? 0}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm w-10 text-right">{vm.ivPercentile != null ? `${vm.ivPercentile}%` : 'N/A'}</span>
                    </div>
                  </div>
                  {/* IV Rank */}
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title={vm.ivPercentileSource === 'iv_history'
                      ? `Where current IV sits in the ${vm.ivHistoryDays}-day historical IV min-max range. 0% = at IV floor, 100% = at IV ceiling.`
                      : `Where current IV sits in the historical min-max RV range (RV approximation). Will switch to true IV rank after 30 daily snapshots.`
                    }>
                      IV Rank ({vm.ivPercentileSource === 'iv_history' ? `${vm.ivHistoryDays}d` : `${vm.rvHistoryDays}d`})
                      {vm.ivPercentileSource === 'rv_approximation' && <span className="text-yellow-400 ml-1" title="Using RV-based approximation — collecting IV history">~</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${vm.ivRank != null && vm.ivRank >= 75 ? 'bg-green-500' : vm.ivRank != null && vm.ivRank >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${vm.ivRank ?? 0}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm w-10 text-right">{vm.ivRank != null ? `${vm.ivRank}%` : 'N/A'}</span>
                    </div>
                  </div>
                  {/* RV Percentile */}
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title="Percentage of historical RV values below current RV. Shows whether actual stock movement is high or low compared to recent history.">RV Percentile ({vm.rvHistoryDays}d)</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${vm.rvPercentile ?? 0}%` }}
                        />
                      </div>
                      <span className="font-mono text-sm w-10 text-right">{vm.rvPercentile != null ? `${vm.rvPercentile}%` : 'N/A'}</span>
                    </div>
                  </div>
                  {/* Premium Score */}
                  <div>
                    <div className="text-xs text-dim mb-1 cursor-help" title="Weighted premium quality score (0-100): 45% IV percentile + 35% normalized IV/RV ratio + 20% IV trend. Rich = attractive for selling, Cheap = options underpriced.">Premium Quality</div>
                    {vm.premiumScore != null ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${vm.premiumScore >= 70 ? 'bg-green-500' : vm.premiumScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${vm.premiumScore}%` }}
                          />
                        </div>
                        <span className={`font-mono text-sm capitalize ${premiumColor}`}>{vm.premiumLabel}</span>
                      </div>
                    ) : (
                      <span className="font-mono text-sm text-dim">N/A (no IV)</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-xs text-dim space-y-0.5">
                  {vm.rvHistoryRange && (
                    <div>RV range ({vm.rvHistoryDays}d): {vm.rvHistoryRange.min.toFixed(1)}% — {vm.rvHistoryRange.max.toFixed(1)}% (median {vm.rvHistoryRange.median.toFixed(1)}%)</div>
                  )}
                  {vm.ivHistoryRange && (
                    <div>IV range ({vm.ivHistoryDays}d): {vm.ivHistoryRange.min.toFixed(1)}% — {vm.ivHistoryRange.max.toFixed(1)}% (median {vm.ivHistoryRange.median.toFixed(1)}%)</div>
                  )}
                  {vm.ivPercentileSource === 'rv_approximation' && vm.ivHistoryDays > 0 && (
                    <div className="text-yellow-400/80">IV percentile uses RV approximation ({vm.ivHistoryDays}/30 snapshots collected)</div>
                  )}
                  {vm.ivPercentileSource === 'rv_approximation' && vm.ivHistoryDays === 0 && (
                    <div className="text-yellow-400/80">IV percentile uses RV approximation (no IV history yet — run backfill or accumulate daily)</div>
                  )}
                  {result.ivDbError && (
                    <div className="text-red-400/80">DB error: {result.ivDbError}</div>
                  )}
                  {vm.ivDebug && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-blue-400/70 hover:text-blue-400">IV Debug Diagnostics</summary>
                      <div className="mt-1 font-mono text-[10px] leading-tight bg-black/30 rounded p-2 space-y-0.5">
                        <div>Rows: {vm.ivDebug.totalRows} | Current IV: {vm.ivDebug.currentIV != null ? (vm.ivDebug.currentIV * 100).toFixed(1) + '%' : 'N/A'}</div>
                        <div>Below count: {vm.ivDebug.belowCount}/{vm.ivDebug.totalRows} = {vm.ivDebug.ivPercentileCalc}</div>
                        <div>IV Rank: {vm.ivDebug.ivRankCalc}</div>
                        <div>Distribution: P10={vm.ivDebug.distribution.p10}% P25={vm.ivDebug.distribution.p25}% P50={vm.ivDebug.distribution.p50}% P75={vm.ivDebug.distribution.p75}% P90={vm.ivDebug.distribution.p90}%</div>
                        <div className="mt-0.5">Recent IV history:</div>
                        {vm.ivDebug.recentEntries.map((e, i) => (
                          <div key={i} className="pl-2">{e.date}: {e.iv.toFixed(1)}%</div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })()}

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

          {/* Price History Chart */}
          <PriceHistoryChart ticker={result.ticker} />

          {/* Upcoming Events */}
          <UpcomingEvents ticker={result.ticker} />

          {/* Cone Chart */}
          <div className="bg-surface-card border border-edge rounded-lg p-5">
            <h3 className="text-sm font-medium text-dim mb-4">Forecast Cone</h3>
            <ForecastConeChart horizons={result.horizons} spot={result.spot} targetPrice={targetPrice} />
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

          {/* Premium Sell / Avoid Checklist */}
          <PremiumChecklist volatilityMetrics={result.volatilityMetrics} ticker={result.ticker} />

          {/* Data Table */}
          <div className="bg-surface-card border border-edge rounded-lg overflow-hidden">
            <ForecastTable horizons={filteredHorizons} spot={result.spot} />
          </div>

          {/* Credit Spread Pricing - On Demand */}
          {!creditSpreads && !creditSpreadsLoading && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreditSpreads}
                className="flex items-center gap-2 px-4 py-2 bg-surface-card border border-edge rounded-lg text-sm font-medium text-accent hover:bg-surface-hover transition-colors"
              >
                <Scissors size={16} />
                Load Credit Spread Pricing
              </button>
              {creditSpreadsError && (
                <span className="text-red-400 text-sm">{creditSpreadsError}</span>
              )}
            </div>
          )}

          {creditSpreadsLoading && (
            <div className="bg-surface-card border border-edge rounded-lg p-6 flex items-center justify-center gap-3">
              <Loader2 size={20} className="animate-spin text-accent" />
              <span className="text-sm text-dim">Fetching credit spread pricing...</span>
            </div>
          )}

          {creditSpreads && (
            <>
              <div className="bg-surface-card border border-edge rounded-lg overflow-hidden">
                <CreditSpreadTable
                  rows={activeTab === 'all'
                    ? creditSpreads.putSpreads
                    : creditSpreads.putSpreads.filter(r => r.horizonWeeks === Number(activeTab))
                  }
                  type="put"
                  spreadWidth={creditSpreads.spreadWidth}
                />
              </div>
              <div className="bg-surface-card border border-edge rounded-lg overflow-hidden">
                <CreditSpreadTable
                  rows={activeTab === 'all'
                    ? creditSpreads.callSpreads
                    : creditSpreads.callSpreads.filter(r => r.horizonWeeks === Number(activeTab))
                  }
                  type="call"
                  spreadWidth={creditSpreads.spreadWidth}
                />
              </div>

              {/* Credit Spread Debug Info (temporary) */}
              {(creditSpreads as any)._debug && (
                <div className="bg-surface-card border border-edge rounded-lg p-4">
                  <details>
                    <summary className="text-xs text-dim cursor-pointer">Credit Spread Debug Info</summary>
                    <pre className="text-xs text-dim mt-2 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify((creditSpreads as any)._debug, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </>
          )}

          {/* Calculation Details Toggle + Download */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-surface-card text-dim hover:text-white hover:bg-surface-hover border border-edge"
            >
              {showDetails ? 'Hide' : 'Show'} Calculation Details
            </button>
            <button
              onClick={() => downloadForecastMarkdown(result)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-surface-card text-dim hover:text-white hover:bg-surface-hover border border-edge flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Calculations (.md)
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

          {/* Credit Spread Analysis */}
          <div className="bg-surface-card border border-edge rounded-lg p-5">
            {spreadAnalysis ? (
              <>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-accent" />
                  <span className="text-accent">Credit Spread Analysis</span>
                  <span className="text-xs text-dim font-normal">(Claude)</span>
                </h3>
                <div className="text-sm text-primary/80 leading-relaxed whitespace-pre-wrap prose-invert mb-4">
                  {spreadAnalysis}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSpreadAnalysis}
                    disabled={spreadLoading}
                    className="px-4 py-2 border border-edge rounded-lg text-xs text-dim hover:text-primary hover:border-accent transition-colors flex items-center gap-2"
                  >
                    {spreadLoading ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />Regenerating...</>
                    ) : (
                      'Regenerate Analysis'
                    )}
                  </button>
                  <button
                    onClick={() => downloadAnalysisMarkdown(spreadAnalysis!, `${result!.ticker}_credit_spread_analysis_${new Date().toISOString().slice(0, 10)}.md`)}
                    className="px-4 py-2 border border-edge rounded-lg text-xs text-dim hover:text-primary hover:border-accent transition-colors flex items-center gap-2"
                  >
                    <Download className="w-3 h-3" />Download .md
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Scissors className="w-5 h-5 text-dim" />
                    Credit Spread Analysis
                  </h3>
                  <p className="text-xs text-dim mt-1">
                    Get AI-powered credit spread recommendations based on the forecast ranges, volatility regime, and support/resistance levels.
                  </p>
                </div>
                <button
                  onClick={handleSpreadAnalysis}
                  disabled={spreadLoading}
                  className="px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0 ml-4"
                >
                  {spreadLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
                  ) : (
                    'Analyze Spreads'
                  )}
                </button>
              </div>
            )}
            {spreadError && (
              <p className="mt-3 text-xs text-red-400">{spreadError}</p>
            )}
          </div>

          {/* Premium-Aware Credit Spread Analysis */}
          <div className="bg-surface-card border border-edge rounded-lg p-5">
            {premiumAnalysis ? (
              <>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-green-400" />
                  <span className="text-green-400">Premium-Aware Spread Analysis</span>
                  <span className="text-xs text-dim font-normal">(Claude + Live Pricing)</span>
                </h3>
                <div className="text-sm text-primary/80 leading-relaxed whitespace-pre-wrap prose-invert mb-4">
                  {premiumAnalysis}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePremiumAwareAnalysis}
                    disabled={premiumAnalysisLoading}
                    className="px-4 py-2 border border-edge rounded-lg text-xs text-dim hover:text-primary hover:border-green-400 transition-colors flex items-center gap-2"
                  >
                    {premiumAnalysisLoading ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />Regenerating...</>
                    ) : (
                      'Regenerate Analysis'
                    )}
                  </button>
                  <button
                    onClick={() => downloadAnalysisMarkdown(premiumAnalysis!, `${result!.ticker}_premium_aware_analysis_${new Date().toISOString().slice(0, 10)}.md`)}
                    className="px-4 py-2 border border-edge rounded-lg text-xs text-dim hover:text-primary hover:border-green-400 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-3 h-3" />Download .md
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Scissors className="w-5 h-5 text-dim" />
                    Premium-Aware Spread Analysis
                  </h3>
                  <p className="text-xs text-dim mt-1">
                    AI analysis using forecast data <strong>plus real option premiums</strong> — optimizes for actual risk/reward from live market pricing.
                  </p>
                </div>
                <button
                  onClick={handlePremiumAwareAnalysis}
                  disabled={premiumAnalysisLoading}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0 ml-4"
                >
                  {premiumAnalysisLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
                  ) : (
                    'Analyze with Pricing'
                  )}
                </button>
              </div>
            )}
            {premiumAnalysisError && (
              <p className="mt-3 text-xs text-red-400">{premiumAnalysisError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
