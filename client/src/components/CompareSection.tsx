import React, { useState } from 'react';
import { Search, Loader2, AlertCircle, Download, Trophy, Plus, X, Info } from 'lucide-react';
import { fetchComparison, fetchNarrative, fetchBatchCreditSpreads, fetchPremiumNarrative, CompareResult, CompareTickerResult, CreditSpreadPricingResult } from '../api';

// --- Tooltip descriptions ---
const TOOLTIPS = {
  composite: 'Weighted ranking score for cross-ticker comparison. 40% Premium Score + 25% IV/RV + 25% IV Percentile + 10% Regime Bonus.',
  premiumScore: 'Per-ticker premium attractiveness. 45% IV Percentile + 35% IV/RV Normalized + 20% IV Trend. Measures how rich premiums are for this ticker in isolation.',
  ivRv: 'IV / RV Ratio — how much options overstate actual movement. >1.3x = options overpriced (good for selling). <1.0x = options underpriced (avoid selling).',
  ivPctl: 'IV Percentile — % of historical IV readings below current IV. Higher = options are historically expensive. ≥60% is favorable for selling.',
  ivRank: 'IV Rank — where current IV sits between its 1-year min and max (0-100%). Can be skewed by single spikes; use percentile as primary gauge.',
  regime: 'Volatility regime based on current RV vs. historical median. Compressed = quiet (good for selling), Extreme = crisis (risky).',
  label: 'Premium quality label. Rich (IV≥75th pctl & IV/RV≥1.3x), Moderately Attractive, Neutral, or Cheap.',
  iv: 'Implied Volatility — the market\'s expected annualized move, derived from option prices. Higher IV = more expensive options.',
  rv: 'Realized Volatility (20-day) — how much the stock actually moved recently, annualized.',
  volPremium: 'Vol Premium = IV − RV in percentage points. Positive means options overestimate risk — your edge as a seller.',
  weekMove: '1-week expected move as % of spot price, blended from ATR, RV, IV, and straddle components.',
  skew: 'Directional bias of the forecast — bullish, bearish, or neutral — based on trend indicators.',
} as const;

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1 cursor-help">
      <Info className="w-3 h-3 text-dim/50 group-hover:text-accent transition-colors" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-surface border border-edge px-3 py-2 text-xs text-primary leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
      </span>
    </span>
  );
}

function getMedalColor(rank: number): string {
  if (rank === 1) return 'text-yellow-400';
  if (rank === 2) return 'text-gray-300';
  if (rank === 3) return 'text-orange-400';
  return 'text-dim';
}

function getScoreColor(score: number | null): string {
  if (score == null) return 'text-dim';
  if (score >= 70) return 'text-green-400';
  if (score >= 50) return 'text-blue-400';
  if (score >= 30) return 'text-yellow-400';
  return 'text-red-400';
}

function getLabelColor(label: string | null): string {
  if (!label) return 'text-dim';
  if (label === 'rich') return 'text-green-400';
  if (label === 'moderately attractive') return 'text-blue-400';
  if (label === 'neutral') return 'text-yellow-400';
  return 'text-red-400';
}

function getRegimeColor(regime: string): string {
  if (regime === 'extreme') return 'text-red-400';
  if (regime === 'elevated') return 'text-orange-400';
  if (regime === 'normal') return 'text-green-400';
  if (regime === 'compressed') return 'text-blue-400';
  return 'text-dim';
}

function formatPct(val: number | null, suffix = '%'): string {
  if (val == null) return 'N/A';
  return `${val.toFixed(1)}${suffix}`;
}

function generateComparisonMarkdown(result: CompareResult): string {
  const { comparison, narrative } = result;
  const lines: string[] = [];

  lines.push(`# Premium Selling Comparison`);
  lines.push(`Generated: ${new Date(comparison.generatedAt).toLocaleString()}`);
  lines.push(`Best Pick: **${comparison.bestPick}**`);
  lines.push('');

  // Rankings table
  lines.push('## Rankings');
  lines.push('');
  lines.push('| Rank | Ticker | Composite | Premium Score | IV/RV | IV Pctl | Regime | Label |');
  lines.push('|------|--------|-----------|---------------|-------|---------|--------|-------|');
  for (const t of comparison.tickers) {
    lines.push(
      `| #${t.rank} | ${t.ticker} | ${t.compositeScore}/100 | ${t.premiumScore ?? 'N/A'}/100 | ${t.ivRvRatio?.toFixed(2) ?? 'N/A'}x | ${t.ivPercentile ?? 'N/A'}% | ${t.regime} | ${t.premiumLabel ?? 'N/A'} |`
    );
  }
  lines.push('');

  // Detail per ticker
  lines.push('## Detail');
  lines.push('');
  for (const t of comparison.tickers) {
    lines.push(`### #${t.rank} ${t.ticker}`);
    lines.push(`- Spot: $${t.spot.toFixed(2)}`);
    lines.push(`- IV: ${t.currentIV != null ? t.currentIV.toFixed(1) + '%' : 'N/A'} | RV: ${t.rv20 != null ? t.rv20.toFixed(1) + '%' : 'N/A'}`);
    lines.push(`- IV/RV Ratio: ${t.ivRvRatio?.toFixed(2) ?? 'N/A'}x | Vol Premium: ${t.volPremium != null ? t.volPremium.toFixed(1) + ' pp' : 'N/A'}`);
    lines.push(`- IV Percentile: ${t.ivPercentile ?? 'N/A'}% | IV Rank: ${t.ivRank ?? 'N/A'}%`);
    lines.push(`- Regime: ${t.regime} | Trend: ${t.trendScore != null ? t.trendScore.toFixed(3) : 'N/A'}`);
    lines.push(`- 1W Expected Move: ${t.weekMove != null ? t.weekMove.toFixed(2) + '%' : 'N/A'} | Skew: ${t.weekSkew ?? 'N/A'}`);
    lines.push(`- Composite Score: ${t.compositeScore}/100`);
    lines.push(`  - Premium Score: ${t.compositeComponents.premiumScore} (40%)`);
    lines.push(`  - IV/RV Score: ${t.compositeComponents.ivRvScore} (25%)`);
    lines.push(`  - IV Pctl Score: ${t.compositeComponents.ivPctScore} (25%)`);
    lines.push(`  - Regime Score: ${t.compositeComponents.regimeScore} (10%)`);
    lines.push(`- Verdict: ${t.verdict}`);
    lines.push('');
  }

  // Narrative
  if (narrative) {
    lines.push('## AI Analysis');
    lines.push('');
    lines.push(narrative);
    lines.push('');
  }

  // Failed
  if (result.failed && result.failed.length > 0) {
    lines.push('## Failed Tickers');
    for (const f of result.failed) {
      lines.push(`- ${f.ticker}: ${f.error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function downloadComparisonMarkdown(result: CompareResult) {
  const md = generateComparisonMarkdown(result);
  const tickers = result.comparison.tickers.map(t => t.ticker).join('-');
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `compare-${tickers}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CompareSection() {
  const [tickers, setTickers] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const [premiumNarrative, setPremiumNarrative] = useState<string | null>(null);
  const [premiumNarrativeLoading, setPremiumNarrativeLoading] = useState(false);
  const [premiumNarrativeError, setPremiumNarrativeError] = useState<string | null>(null);
  const [premiumNarrativeProgress, setPremiumNarrativeProgress] = useState<string | null>(null);
  const [spreadsByTicker, setSpreadsByTicker] = useState<Record<string, CreditSpreadPricingResult> | null>(null);

  const addTicker = () => {
    if (tickers.length < 10) {
      setTickers([...tickers, '']);
    }
  };

  const removeTicker = (index: number) => {
    if (tickers.length > 2) {
      setTickers(tickers.filter((_, i) => i !== index));
    }
  };

  const updateTicker = (index: number, value: string) => {
    const updated = [...tickers];
    updated[index] = value.toUpperCase();
    setTickers(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTickers = tickers.map(t => t.trim()).filter(t => t.length > 0);
    if (cleanTickers.length < 2) {
      setError('Enter at least 2 tickers');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setPremiumNarrative(null);
    setPremiumNarrativeError(null);
    setPremiumNarrativeProgress(null);
    setSpreadsByTicker(null);

    try {
      const data = await fetchComparison(cleanTickers);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch comparison');
    } finally {
      setLoading(false);
    }
  };

  const handleRunNarrative = async () => {
    if (!result) return;
    setNarrativeLoading(true);
    setNarrativeError(null);
    try {
      const narrative = await fetchNarrative(result.comparison);
      setResult({ ...result, narrative });
    } catch (err: any) {
      setNarrativeError(err.message || 'Failed to generate narrative');
    } finally {
      setNarrativeLoading(false);
    }
  };

  const handlePremiumNarrative = async () => {
    if (!result) return;
    setPremiumNarrativeLoading(true);
    setPremiumNarrativeError(null);
    setPremiumNarrativeProgress(null);

    try {
      // Step 1: Fetch credit spreads for all tickers (sequential on server)
      let spreads = spreadsByTicker;
      if (!spreads) {
        const tickersWithHorizons = result.comparison.tickers.filter(t => t.horizons && t.horizons.length > 0);
        if (tickersWithHorizons.length === 0) {
          throw new Error('No horizon data available. Please re-run the comparison.');
        }

        setPremiumNarrativeProgress(`Fetching credit spread pricing for ${tickersWithHorizons.length} tickers (sequential to avoid rate limits)...`);

        const batchInput = tickersWithHorizons.map(t => ({
          ticker: t.ticker,
          spot: t.spot,
          horizons: t.horizons!,
        }));

        const batchResult = await fetchBatchCreditSpreads(batchInput);
        spreads = batchResult.results;
        setSpreadsByTicker(spreads);
      }

      // Step 2: Send to AI
      setPremiumNarrativeProgress('Generating premium-aware AI analysis...');
      const narrative = await fetchPremiumNarrative(result.comparison, spreads);
      setPremiumNarrative(narrative);
      setPremiumNarrativeProgress(null);
    } catch (err: any) {
      setPremiumNarrativeError(err.message || 'Failed to generate premium-aware analysis');
      setPremiumNarrativeProgress(null);
    } finally {
      setPremiumNarrativeLoading(false);
    }
  };

  const validCount = tickers.filter(t => t.trim().length > 0).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Trophy className="w-8 h-8 text-accent" />
        <div>
          <h1 className="text-2xl font-bold">Premium Selling Comparison</h1>
          <p className="text-dim text-sm">Compare up to 10 tickers for option premium selling attractiveness</p>
        </div>
      </div>

      {/* Ticker Inputs */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex flex-wrap gap-3 items-end">
          {tickers.map((t, i) => (
            <div key={i} className="relative">
              <label className="block text-xs text-dim mb-1">Ticker {i + 1}</label>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dim" />
                  <input
                    type="text"
                    value={t}
                    onChange={(e) => updateTicker(i, e.target.value)}
                    placeholder={i < 2 ? 'Required' : 'Optional'}
                    className="w-28 pl-8 pr-3 py-2 bg-surface-card border border-edge rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
                    maxLength={10}
                    disabled={loading}
                  />
                </div>
                {tickers.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeTicker(i)}
                    className="p-1 text-dim hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {tickers.length < 10 && (
            <div>
              <label className="block text-xs text-dim mb-1">&nbsp;</label>
              <button
                type="button"
                onClick={addTicker}
                className="px-3 py-2 border border-edge border-dashed rounded-lg text-sm text-dim hover:text-primary hover:border-accent transition-colors flex items-center gap-1"
                disabled={loading}
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs text-dim mb-1">&nbsp;</label>
            <button
              type="submit"
              disabled={loading || validCount < 2}
              className="px-6 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <Trophy className="w-4 h-4" />
                  Compare
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span className="text-red-300 text-sm">{error}</span>
        </div>
      )}

      {/* Failed tickers warning */}
      {result?.failed && result.failed.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-300 text-sm font-medium mb-1">Some tickers failed:</p>
          {result.failed.map((f, i) => (
            <p key={i} className="text-yellow-200/70 text-sm">{f.ticker}: {f.error}</p>
          ))}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Winner banner */}
          <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg flex items-center gap-3">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <div>
              <span className="text-sm text-dim">Best for Premium Selling:</span>
              <span className="ml-2 text-lg font-bold text-accent">{result.comparison.bestPick}</span>
              <span className="ml-2 text-sm text-dim">
                (Score: {result.comparison.tickers[0]?.compositeScore}/100)
              </span>
            </div>
          </div>

          {/* Rankings table */}
          <div className="bg-surface-card border border-edge rounded-lg overflow-hidden">
            <div className="p-4 border-b border-edge">
              <h2 className="text-lg font-semibold">Rankings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge text-dim text-left">
                    <th className="px-4 py-3 font-medium">Rank</th>
                    <th className="px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Composite<Tip text={TOOLTIPS.composite} />
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      Premium Score<Tip text={TOOLTIPS.premiumScore} />
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      IV/RV<Tip text={TOOLTIPS.ivRv} />
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      IV Pctl<Tip text={TOOLTIPS.ivPctl} />
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      IV Rank<Tip text={TOOLTIPS.ivRank} />
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Regime<Tip text={TOOLTIPS.regime} />
                    </th>
                    <th className="px-4 py-3 font-medium">
                      Label<Tip text={TOOLTIPS.label} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.tickers.map((t) => (
                    <tr key={t.ticker} className="border-b border-edge/50 hover:bg-surface-hover transition-colors">
                      <td className={`px-4 py-3 font-bold ${getMedalColor(t.rank)}`}>#{t.rank}</td>
                      <td className="px-4 py-3 font-bold">{t.ticker}</td>
                      <td className={`px-4 py-3 text-right font-mono ${getScoreColor(t.compositeScore)}`}>
                        {t.compositeScore}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${getScoreColor(t.premiumScore)}`}>
                        {t.premiumScore ?? 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {t.ivRvRatio != null ? `${t.ivRvRatio.toFixed(2)}x` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {t.ivPercentile != null ? `${t.ivPercentile}%` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {t.ivRank != null ? `${t.ivRank}%` : 'N/A'}
                      </td>
                      <td className={`px-4 py-3 capitalize ${getRegimeColor(t.regime)}`}>{t.regime}</td>
                      <td className={`px-4 py-3 capitalize ${getLabelColor(t.premiumLabel)}`}>
                        {t.premiumLabel ?? 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.comparison.tickers.map((t) => (
              <TickerCard key={t.ticker} ticker={t} />
            ))}
          </div>

          {/* AI Narrative */}
          <div className="bg-surface-card border border-edge rounded-lg p-5">
            {result.narrative ? (
              <>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="text-accent">AI Analysis</span>
                  <span className="text-xs text-dim font-normal">(Claude)</span>
                </h2>
                <div className="text-sm text-primary/80 leading-relaxed whitespace-pre-wrap mb-4">
                  {result.narrative}
                </div>
                <button
                  onClick={handleRunNarrative}
                  disabled={narrativeLoading}
                  className="px-4 py-2 border border-edge rounded-lg text-xs text-dim hover:text-primary hover:border-accent transition-colors flex items-center gap-2"
                >
                  {narrativeLoading ? (
                    <><Loader2 className="w-3 h-3 animate-spin" />Regenerating...</>
                  ) : (
                    'Regenerate'
                  )}
                </button>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">AI Analysis</h2>
                  <p className="text-xs text-dim mt-1">Get a narrative comparison from Claude analyzing the volatility profiles and premium selling opportunities.</p>
                </div>
                <button
                  onClick={handleRunNarrative}
                  disabled={narrativeLoading}
                  className="px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0 ml-4"
                >
                  {narrativeLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
                  ) : (
                    'Run AI Analysis'
                  )}
                </button>
              </div>
            )}
            {narrativeError && (
              <p className="mt-3 text-xs text-red-400">{narrativeError}</p>
            )}
          </div>

          {/* Premium-Aware AI Narrative */}
          <div className="bg-surface-card border border-edge rounded-lg p-5">
            {premiumNarrative ? (
              <>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="text-green-400">Premium-Aware AI Analysis</span>
                  <span className="text-xs text-dim font-normal">(Claude + Live Pricing)</span>
                </h2>
                <div className="text-sm text-primary/80 leading-relaxed whitespace-pre-wrap mb-4">
                  {premiumNarrative}
                </div>
                <button
                  onClick={handlePremiumNarrative}
                  disabled={premiumNarrativeLoading}
                  className="px-4 py-2 border border-edge rounded-lg text-xs text-dim hover:text-primary hover:border-green-400 transition-colors flex items-center gap-2"
                >
                  {premiumNarrativeLoading ? (
                    <><Loader2 className="w-3 h-3 animate-spin" />Regenerating...</>
                  ) : (
                    'Regenerate'
                  )}
                </button>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Premium-Aware AI Analysis</h2>
                  <p className="text-xs text-dim mt-1">
                    Compare tickers using <strong>real credit spread premiums</strong> — fetches live option pricing for each ticker (sequentially to avoid rate limits), then AI analyzes actual risk/reward.
                  </p>
                </div>
                <button
                  onClick={handlePremiumNarrative}
                  disabled={premiumNarrativeLoading}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0 ml-4"
                >
                  {premiumNarrativeLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{premiumNarrativeProgress ? 'Working...' : 'Analyzing...'}</>
                  ) : (
                    'Analyze with Pricing'
                  )}
                </button>
              </div>
            )}
            {premiumNarrativeProgress && premiumNarrativeLoading && (
              <p className="mt-3 text-xs text-accent">{premiumNarrativeProgress}</p>
            )}
            {premiumNarrativeError && (
              <p className="mt-3 text-xs text-red-400">{premiumNarrativeError}</p>
            )}
          </div>

          {/* Premium Spread Debug Info */}
          {spreadsByTicker && (
            <div className="bg-surface-card border border-edge rounded-lg p-4">
              <details>
                <summary className="text-xs text-dim cursor-pointer hover:text-primary">
                  Credit Spread Pricing Debug ({Object.keys(spreadsByTicker).length} tickers)
                </summary>
                <div className="mt-3 space-y-3">
                  {Object.entries(spreadsByTicker).map(([ticker, data]: [string, any]) => (
                    <div key={ticker}>
                      <div className="text-xs font-bold text-accent mb-1">{ticker} (width: ${data.spreadWidth})</div>
                      {data._debug?.expirations?.map((e: any, i: number) => (
                        <div key={i} className="text-[10px] font-mono text-yellow-400/70 pl-2 mb-1">
                          exp {e.exp}: {e.puts} puts, {e.calls} calls
                          {e.samplePut && (
                            <span> | sample put ${e.samplePut.strike}: quote={JSON.stringify(e.samplePut.last_quote)}, fmv={e.samplePut.fair_market_value}, lastTrade={e.samplePut.last_trade_price}, dayClose={e.samplePut.day_close}, prevClose={e.samplePut.prev_day_close}</span>
                          )}
                        </div>
                      ))}
                      {data.putSpreads.length === 0 && data.callSpreads.length === 0 ? (
                        <div className="text-xs text-red-400 pl-2">No spread data returned</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {/* Put spreads */}
                          <div>
                            <div className="text-xs text-dim font-medium mb-1">PUT Spreads:</div>
                            {data.putSpreads.map((row, i) => (
                              <div key={i} className="text-[10px] font-mono text-dim pl-2 mb-1">
                                <div>{row.horizon} (exp: {row.targetDate}):</div>
                                {['range50', 'range68', 'range90'].map(rn => {
                                  const cell = (row.ranges as any)[rn];
                                  if (!cell) return <div key={rn} className="pl-2 text-red-400/70">{rn}: no data</div>;
                                  return (
                                    <div key={rn} className="pl-2">
                                      {rn}: Sell ${cell.sellStrike} (mid:{cell.sellMid}) / Buy ${cell.buyStrike} (mid:{cell.buyMid}) → prem: ${cell.premium} (${cell.premiumPerContract}/ct), maxLoss: ${cell.maxLoss}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                          {/* Call spreads */}
                          <div>
                            <div className="text-xs text-dim font-medium mb-1">CALL Spreads:</div>
                            {data.callSpreads.map((row, i) => (
                              <div key={i} className="text-[10px] font-mono text-dim pl-2 mb-1">
                                <div>{row.horizon} (exp: {row.targetDate}):</div>
                                {['range50', 'range68', 'range90'].map(rn => {
                                  const cell = (row.ranges as any)[rn];
                                  if (!cell) return <div key={rn} className="pl-2 text-red-400/70">{rn}: no data</div>;
                                  return (
                                    <div key={rn} className="pl-2">
                                      {rn}: Sell ${cell.sellStrike} (mid:{cell.sellMid}) / Buy ${cell.buyStrike} (mid:{cell.buyMid}) → prem: ${cell.premium} (${cell.premiumPerContract}/ct), maxLoss: ${cell.maxLoss}
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Download */}
          <div className="flex justify-end">
            <button
              onClick={() => downloadComparisonMarkdown(result)}
              className="px-4 py-2 bg-surface-card border border-edge rounded-lg text-sm text-dim hover:text-primary hover:border-accent transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Comparison Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TickerCard({ ticker: t }: { ticker: CompareTickerResult }) {
  return (
    <div className="bg-surface-card border border-edge rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${getMedalColor(t.rank)}`}>#{t.rank}</span>
          <span className="text-lg font-bold">{t.ticker}</span>
          <span className="text-sm text-dim">${t.spot.toFixed(2)}</span>
        </div>
        <div className={`text-2xl font-bold ${getScoreColor(t.compositeScore)}`}>
          {t.compositeScore}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-3">
        <div className="flex justify-between">
          <span className="text-dim">IV<Tip text={TOOLTIPS.iv} /></span>
          <span className="font-mono">{formatPct(t.currentIV)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">RV₂₀<Tip text={TOOLTIPS.rv} /></span>
          <span className="font-mono">{formatPct(t.rv20)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">IV/RV<Tip text={TOOLTIPS.ivRv} /></span>
          <span className="font-mono">{t.ivRvRatio != null ? `${t.ivRvRatio.toFixed(2)}x` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Vol Premium<Tip text={TOOLTIPS.volPremium} /></span>
          <span className="font-mono">{t.volPremium != null ? `${t.volPremium.toFixed(1)} pp` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">IV Pctl<Tip text={TOOLTIPS.ivPctl} /></span>
          <span className="font-mono">{t.ivPercentile != null ? `${t.ivPercentile}%` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">IV Rank<Tip text={TOOLTIPS.ivRank} /></span>
          <span className="font-mono">{t.ivRank != null ? `${t.ivRank}%` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Regime<Tip text={TOOLTIPS.regime} /></span>
          <span className={`capitalize ${getRegimeColor(t.regime)}`}>{t.regime}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Label<Tip text={TOOLTIPS.label} /></span>
          <span className={`capitalize ${getLabelColor(t.premiumLabel)}`}>{t.premiumLabel ?? 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">1W Move<Tip text={TOOLTIPS.weekMove} /></span>
          <span className="font-mono">{t.weekMove != null ? `${t.weekMove.toFixed(2)}%` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Skew<Tip text={TOOLTIPS.skew} /></span>
          <span className="capitalize">{t.weekSkew ?? 'N/A'}</span>
        </div>
      </div>

      {/* Composite breakdown bar */}
      <div className="mb-3">
        <div className="flex gap-0.5 h-2 rounded overflow-hidden">
          <div
            className="bg-green-500"
            style={{ width: `${t.compositeComponents.premiumScore * 0.4}%` }}
            title={`Premium Score: ${t.compositeComponents.premiumScore}/100 (40% weight)`}
          />
          <div
            className="bg-blue-500"
            style={{ width: `${t.compositeComponents.ivRvScore * 0.25}%` }}
            title={`IV/RV Score: ${t.compositeComponents.ivRvScore}/100 (25% weight)`}
          />
          <div
            className="bg-purple-500"
            style={{ width: `${t.compositeComponents.ivPctScore * 0.25}%` }}
            title={`IV Percentile: ${t.compositeComponents.ivPctScore}/100 (25% weight)`}
          />
          <div
            className="bg-yellow-500"
            style={{ width: `${t.compositeComponents.regimeScore * 0.1}%` }}
            title={`Regime Bonus: ${t.compositeComponents.regimeScore}/100 (10% weight)`}
          />
        </div>
        <div className="flex gap-3 mt-1 text-xs text-dim">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500 inline-block"></span>Premium</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500 inline-block"></span>IV/RV</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500 inline-block"></span>IV Pctl</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-500 inline-block"></span>Regime</span>
        </div>
      </div>

      {/* Verdict */}
      <p className="text-xs text-dim leading-relaxed">{t.verdict}</p>
    </div>
  );
}
