import React, { useState } from 'react';
import { Search, Loader2, AlertCircle, Download, Trophy, Plus, X } from 'lucide-react';
import { fetchComparison, CompareResult, CompareTickerResult } from '../api';

function getMedalColor(rank: number): string {
  if (rank === 1) return 'text-yellow-400';
  if (rank === 2) return 'text-gray-300';
  if (rank === 3) return 'text-amber-600';
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

  const addTicker = () => {
    if (tickers.length < 5) {
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

    try {
      const data = await fetchComparison(cleanTickers);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch comparison');
    } finally {
      setLoading(false);
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
          <p className="text-dim text-sm">Compare up to 5 tickers for option premium selling attractiveness</p>
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

          {tickers.length < 5 && (
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
                    <th className="px-4 py-3 font-medium text-right">Composite</th>
                    <th className="px-4 py-3 font-medium text-right">Premium Score</th>
                    <th className="px-4 py-3 font-medium text-right">IV/RV</th>
                    <th className="px-4 py-3 font-medium text-right">IV Pctl</th>
                    <th className="px-4 py-3 font-medium text-right">IV Rank</th>
                    <th className="px-4 py-3 font-medium">Regime</th>
                    <th className="px-4 py-3 font-medium">Label</th>
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
          {result.narrative && (
            <div className="bg-surface-card border border-accent/30 rounded-lg p-5">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className="text-accent">AI Analysis</span>
                <span className="text-xs text-dim font-normal">(Claude)</span>
              </h2>
              <div className="text-sm text-primary/80 leading-relaxed whitespace-pre-wrap">
                {result.narrative}
              </div>
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
          <span className="text-dim">IV</span>
          <span className="font-mono">{formatPct(t.currentIV)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">RV₂₀</span>
          <span className="font-mono">{formatPct(t.rv20)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">IV/RV</span>
          <span className="font-mono">{t.ivRvRatio != null ? `${t.ivRvRatio.toFixed(2)}x` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Vol Premium</span>
          <span className="font-mono">{t.volPremium != null ? `${t.volPremium.toFixed(1)} pp` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">IV Pctl</span>
          <span className="font-mono">{t.ivPercentile != null ? `${t.ivPercentile}%` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">IV Rank</span>
          <span className="font-mono">{t.ivRank != null ? `${t.ivRank}%` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Regime</span>
          <span className={`capitalize ${getRegimeColor(t.regime)}`}>{t.regime}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Label</span>
          <span className={`capitalize ${getLabelColor(t.premiumLabel)}`}>{t.premiumLabel ?? 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">1W Move</span>
          <span className="font-mono">{t.weekMove != null ? `${t.weekMove.toFixed(2)}%` : 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Skew</span>
          <span className="capitalize">{t.weekSkew ?? 'N/A'}</span>
        </div>
      </div>

      {/* Composite breakdown bar */}
      <div className="mb-3">
        <div className="flex gap-0.5 h-2 rounded overflow-hidden">
          <div
            className="bg-green-500"
            style={{ width: `${t.compositeComponents.premiumScore * 0.4}%` }}
            title={`Premium: ${t.compositeComponents.premiumScore}`}
          />
          <div
            className="bg-blue-500"
            style={{ width: `${t.compositeComponents.ivRvScore * 0.25}%` }}
            title={`IV/RV: ${t.compositeComponents.ivRvScore}`}
          />
          <div
            className="bg-purple-500"
            style={{ width: `${t.compositeComponents.ivPctScore * 0.25}%` }}
            title={`IV Pctl: ${t.compositeComponents.ivPctScore}`}
          />
          <div
            className="bg-yellow-500"
            style={{ width: `${t.compositeComponents.regimeScore * 0.1}%` }}
            title={`Regime: ${t.compositeComponents.regimeScore}`}
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
