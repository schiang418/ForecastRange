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

/**
 * Generate a premium-aware AI narrative using Claude API.
 * Includes both volatility metrics AND real credit spread pricing per ticker.
 *
 * @param {Object} comparison - Output from buildComparison()
 * @param {Object} spreadsByTicker - { AAPL: { putSpreads, callSpreads, spreadWidth }, ... }
 * @returns {Promise<string|null>} Narrative text or null
 */
async function generatePremiumNarrative(comparison, spreadsByTicker) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    // Build per-ticker summaries with both vol metrics and spread pricing
    const tickerBlocks = comparison.tickers.map(t => {
      const lines = [];
      lines.push(`--- ${t.ticker} (Rank #${t.rank}) ---`);
      lines.push(`Spot: $${t.spot.toFixed(2)}`);
      lines.push(`IV: ${t.currentIV ?? 'N/A'}%, RV: ${t.rv20 ?? 'N/A'}%, IV/RV: ${t.ivRvRatio?.toFixed(2) ?? 'N/A'}x`);
      lines.push(`IV Percentile: ${t.ivPercentile ?? 'N/A'}%, IV Rank: ${t.ivRank ?? 'N/A'}%`);
      lines.push(`Regime: ${t.regime}, Premium Score: ${t.premiumScore ?? 'N/A'}/100 (${t.premiumLabel ?? 'N/A'})`);
      lines.push(`Trend Score: ${t.trendScore != null ? t.trendScore.toFixed(3) : 'N/A'}, 1W Move: ${t.weekMove ?? 'N/A'}%, Skew: ${t.weekSkew ?? 'N/A'}`);

      // Add credit spread pricing if available
      const spreads = spreadsByTicker[t.ticker];
      if (spreads && (spreads.putSpreads?.length > 0 || spreads.callSpreads?.length > 0)) {
        lines.push('');
        lines.push(`Credit Spread Pricing (Width: $${spreads.spreadWidth}):`);

        const formatRows = (rows, type) => {
          for (const row of rows) {
            lines.push(`  ${row.horizon}:`);
            let hasAny = false;
            for (const [rangeName, label] of [['range50', '50%'], ['range68', '68%'], ['range90', '90%']]) {
              const cell = row.ranges[rangeName];
              if (!cell) continue;
              hasAny = true;
              const returnOnRisk = cell.maxLoss > 0
                ? ((cell.premiumPerContract / cell.maxLoss) * 100).toFixed(1) + '%'
                : 'N/A';
              lines.push(`    ${label} ${type.toUpperCase()}: Sell $${cell.sellStrike} / Buy $${cell.buyStrike} — Premium $${cell.premiumPerContract}/contract, Max Loss $${cell.maxLoss}, RoR: ${returnOnRisk}${cell.sellIV != null ? ', Sell IV: ' + (cell.sellIV * 100).toFixed(1) + '%' : ''}`);
            }
            if (!hasAny) {
              lines.push(`    No ${type} pricing available`);
            }
          }
        };

        formatRows(spreads.putSpreads, 'put');
        formatRows(spreads.callSpreads, 'call');
      } else {
        lines.push('');
        lines.push('Credit Spread Pricing: NOT AVAILABLE — no options chain data or pricing fetch failed for this ticker.');
      }

      return lines.join('\n');
    }).join('\n\n');

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: `You are an expert options analyst specializing in credit spreads for premium collection.

You are comparing multiple tickers for a trader deciding WHERE to sell credit spreads. You have TWO types of data per ticker:
1. VOLATILITY METRICS — IV, RV, IV/RV ratio, IV percentile, regime, premium score, trend
2. REAL CREDIT SPREAD PRICING — actual put and call credit spread premiums at the 50%, 68%, and 90% probability boundaries with return-on-risk ratios

Your job: determine which ticker(s) offer the best premium selling opportunities by analyzing BOTH the volatility profile AND the actual achievable premiums.

Key principles:
- A high premium score with thin actual premiums (<$0.15/share) is misleading — the real pricing is what matters.
- Compare return-on-risk (premium/maxLoss) across tickers to find the best bang for the capital.
- A ticker with lower premium score but better actual credit spread pricing may be the better trade.
- Consider which probability band (50%, 68%, 90%) gives the best risk/reward per ticker.
- Factor in trend/skew: bullish tickers favor put spreads, bearish favor call spreads.
- Flag any tickers where pricing data is missing or incomplete — DO NOT guess or assume premiums. Clearly state what data is unavailable and explain how this limits your analysis for that ticker.
- If a ticker has no credit spread pricing, you can still evaluate it on volatility metrics alone but explicitly note this limitation.

IMPORTANT: Be factually accurate. Only cite numbers that appear in the data. If data is missing for a ticker, say so clearly — never fabricate premium amounts or strike prices. When comparing, only compare tickers that have actual pricing data available.

Output format:

**CROSS-TICKER PREMIUM COMPARISON:**
For each ticker with pricing data, highlight the best spread setup (put or call, which probability band) and its return-on-risk. Note any tickers without pricing data.

**BEST TRADE: [TICKER] — [PUT/CALL CREDIT SPREAD]**
- Specific setup: Sell [strike] / Buy [strike], [expiration]
- Premium: $[X]/contract, Max Loss: $[X], Return on Risk: [X]%
- Why this ticker wins: [compare actual premiums AND vol profile vs others]

**RUNNER-UP: [TICKER]** (if applicable)
- Why it's second: [brief comparison]

**AVOID: [TICKER(S)]** (if applicable)
- Why: [thin premiums, poor risk/reward, missing data, etc.]

**RISK FACTORS:**
- Per-ticker warnings (regime, trend against the spread, thin liquidity)
- Any data gaps that affect the analysis

Be direct and specific. Use the actual numbers from the pricing data.`,
      messages: [{
        role: 'user',
        content: `Compare these tickers for premium selling using both volatility metrics and real credit spread pricing:\n\n${tickerBlocks}`,
      }],
    });

    return message.content[0]?.text ?? null;
  } catch (err) {
    console.warn(`[compare] Claude API premium narrative failed: ${err.message}`);
    return null;
  }
}

module.exports = { buildComparison, generateNarrative, generatePremiumNarrative };
