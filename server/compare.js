/**
 * Multi-ticker comparison engine.
 *
 * Ranks tickers on premium-selling attractiveness using hardcoded logic,
 * and optionally generates a narrative summary via Claude API.
 */

/**
 * Build a comparison from multiple forecast results.
 *
 * @param {Array<{ticker: string, result: Object}>} forecasts - Forecast results per ticker
 * @returns {Object} Comparison data with rankings and per-ticker summaries
 */
function buildComparison(forecasts) {
  const tickers = forecasts.map(f => ({
    ticker: f.ticker,
    spot: f.result.spot,
    // Volatility metrics
    currentIV: f.result.volatilityMetrics?.currentIVPct ?? null,
    rv20: f.result.volatilityMetrics?.rv20AnnualizedPct ?? null,
    ivRvRatio: f.result.volatilityMetrics?.ivRvRatio ?? null,
    volPremium: f.result.volatilityMetrics?.volPremium ?? null,
    ivPercentile: f.result.volatilityMetrics?.ivPercentile ?? null,
    ivRank: f.result.volatilityMetrics?.ivRank ?? null,
    rvPercentile: f.result.volatilityMetrics?.rvPercentile ?? null,
    regime: f.result.volatilityMetrics?.regime ?? 'unknown',
    premiumScore: f.result.volatilityMetrics?.premiumScore ?? null,
    premiumLabel: f.result.volatilityMetrics?.premiumLabel ?? null,
    ivPercentileSource: f.result.volatilityMetrics?.ivPercentileSource ?? null,
    // Trend
    trendScore: f.result.trendScore ?? null,
    // 1-week horizon summary
    weekMove: f.result.horizons?.[0]?.expectedMovePct ?? null,
    weekConfidence: f.result.horizons?.[0]?.confidence ?? null,
    weekSkew: f.result.horizons?.[0]?.skew ?? null,
    // Options availability
    ivAvailable: f.result.ivAvailable ?? false,
    straddleAvailable: f.result.straddleAvailable ?? false,
  }));

  // Rank tickers by premium selling attractiveness
  const ranked = rankForPremiumSelling(tickers);

  return {
    tickers: ranked,
    bestPick: ranked[0]?.ticker ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Rank tickers for premium selling attractiveness.
 * Higher composite score = better for selling premium.
 */
function rankForPremiumSelling(tickers) {
  const scored = tickers.map(t => {
    // Composite ranking score (0-100)
    // Weights: 40% premiumScore, 25% ivRvRatio, 25% ivPercentile, 10% regime bonus
    let compositeScore = 0;
    let components = {};

    // Premium score component (0-100, already computed)
    const premiumComponent = t.premiumScore ?? 0;
    components.premiumScore = premiumComponent;

    // IV/RV ratio component: normalize 1.0→0, 1.5→50, 2.0→100
    let ivRvComponent = 0;
    if (t.ivRvRatio != null) {
      ivRvComponent = Math.max(0, Math.min(100, ((t.ivRvRatio - 1.0) / 1.0) * 100));
    }
    components.ivRvScore = Math.round(ivRvComponent);

    // IV percentile component (0-100, direct)
    const ivPctComponent = t.ivPercentile ?? 0;
    components.ivPctScore = ivPctComponent;

    // Regime bonus: compressed/normal = good, elevated = ok, extreme = penalty
    let regimeBonus = 0;
    if (t.regime === 'compressed') regimeBonus = 80;
    else if (t.regime === 'normal') regimeBonus = 60;
    else if (t.regime === 'elevated') regimeBonus = 30;
    else if (t.regime === 'extreme') regimeBonus = 0;
    components.regimeScore = regimeBonus;

    compositeScore = Math.round(
      0.40 * premiumComponent +
      0.25 * ivRvComponent +
      0.25 * ivPctComponent +
      0.10 * regimeBonus
    );
    compositeScore = Math.max(0, Math.min(100, compositeScore));

    // Generate verdict
    const verdict = generateVerdict(t, compositeScore);

    return {
      ...t,
      compositeScore,
      compositeComponents: components,
      verdict,
    };
  });

  // Sort by composite score descending
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  // Add rank
  scored.forEach((t, i) => { t.rank = i + 1; });

  return scored;
}

/**
 * Generate a short verdict for each ticker.
 */
function generateVerdict(t, score) {
  const parts = [];

  // IV/RV assessment
  if (t.ivRvRatio != null) {
    if (t.ivRvRatio >= 1.5) parts.push('Options significantly overpriced vs. realized movement');
    else if (t.ivRvRatio >= 1.3) parts.push('Options moderately overpriced');
    else if (t.ivRvRatio >= 1.1) parts.push('Options slightly overpriced');
    else if (t.ivRvRatio >= 1.0) parts.push('Options fairly priced');
    else parts.push('Options underpriced — avoid selling');
  }

  // IV percentile assessment
  if (t.ivPercentile != null) {
    if (t.ivPercentile >= 75) parts.push('IV historically high (rich premiums)');
    else if (t.ivPercentile >= 50) parts.push('IV above average');
    else if (t.ivPercentile >= 25) parts.push('IV below average (thin premiums)');
    else parts.push('IV historically low (poor premiums)');
  }

  // Regime warning
  if (t.regime === 'extreme') parts.push('WARNING: Extreme vol regime — elevated tail risk');
  else if (t.regime === 'compressed') parts.push('Compressed regime favors premium decay');

  // Overall recommendation
  if (score >= 70) parts.push('STRONG SELL PREMIUM candidate');
  else if (score >= 50) parts.push('Moderate premium selling opportunity');
  else if (score >= 30) parts.push('Below-average conditions — be selective');
  else parts.push('Poor conditions for premium selling');

  return parts.join('. ') + '.';
}

/**
 * Generate an AI narrative comparison using Claude API (optional).
 * Returns null if ANTHROPIC_API_KEY is not set.
 *
 * @param {Object} comparison - Output from buildComparison()
 * @returns {Promise<string|null>} Narrative text or null
 */
async function generateNarrative(comparison) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const tickerSummaries = comparison.tickers.map(t =>
      `${t.ticker} (Rank #${t.rank}): ` +
      `IV=${t.currentIV ?? 'N/A'}%, RV=${t.rv20 ?? 'N/A'}%, ` +
      `IV/RV=${t.ivRvRatio ?? 'N/A'}x, ` +
      `IV Pctl=${t.ivPercentile ?? 'N/A'}%, IV Rank=${t.ivRank ?? 'N/A'}%, ` +
      `Regime=${t.regime}, Premium Score=${t.premiumScore ?? 'N/A'}/100 (${t.premiumLabel ?? 'N/A'}), ` +
      `1W Expected Move=${t.weekMove ?? 'N/A'}%, Trend Score=${t.trendScore != null ? t.trendScore.toFixed(3) : 'N/A'}, ` +
      `Skew=${t.weekSkew ?? 'N/A'}`
    ).join('\n');

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: `You are a concise options analyst specializing in premium selling strategies.
Write a 2-4 paragraph comparison of the tickers below for a trader looking to sell options premium.
Focus on: which ticker offers the best risk/reward for premium selling and why,
key differences in their volatility profiles, and any warnings.
Be direct and actionable. Use specific numbers from the data. Do not use headers or bullet points.`,
      messages: [{
        role: 'user',
        content: `Compare these tickers for premium selling:\n\n${tickerSummaries}`,
      }],
    });

    return message.content[0]?.text ?? null;
  } catch (err) {
    console.warn(`[compare] Claude API narrative failed: ${err.message}`);
    return null;
  }
}

module.exports = { buildComparison, generateNarrative };
