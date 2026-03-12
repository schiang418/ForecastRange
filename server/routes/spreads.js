const express = require('express');
const router = express.Router();

/**
 * POST /api/forecast/spreads
 * Body: { forecast: <ForecastResult> }
 *
 * Sends forecast data to Claude for credit spread trade analysis.
 * Only called on user request (button click).
 */
router.post('/', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { forecast } = req.body;
    if (!forecast?.ticker || !forecast?.horizons || !forecast?.spot) {
      return res.status(400).json({ error: 'Valid forecast data required' });
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    // Build a focused data summary for Claude
    const dataBlock = buildSpreadDataBlock(forecast);

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: `You are an expert options strategist specializing in credit spreads for premium collection.

The user wants to sell credit spreads (put credit spreads and/or call credit spreads) with 1-2 week expirations, prioritizing SAFETY — minimizing the risk of the short strike being breached at expiration.

Your job: analyze the forecast data and recommend specific credit spread setups.

Key principles:
- Put credit spread: sell a put at a higher strike, buy a put at a lower strike. Risk = price drops below the sold put.
- Call credit spread: sell a call at a lower strike, buy a call at a higher strike. Risk = price rises above the sold call.
- For a good risk/reward balance, place the sold strike near or just outside the 68% range (1-sigma, ~16% chance of breach per side). This gives meaningful premium while keeping probability of profit around 80-85%.
- The 50% range is aggressive (more premium but ~25% breach risk). The 90% range is too conservative (tiny premium, not worth the capital).
- Use $5 or $10 wide spreads for liquid stocks; $1-$2.50 for stocks under $50.
- Consider the trend/skew: if bullish, put spreads are safer; if bearish, call spreads are safer.
- Consider support/resistance as natural barriers that add safety — a sold strike with S/R backing is stronger.
- Iron condors (both put + call spread) are best in neutral/compressed regimes.

IMPORTANT: You MUST evaluate BOTH a put credit spread AND a call credit spread for every analysis. Present both sides with specific strikes, then explain which you recommend and why the other side is less attractive. Do not default to put spreads — give call spreads equal consideration. If both sides look viable, recommend an iron condor.

Output format — use this EXACT structure:

**PUT CREDIT SPREAD EVALUATION:**
- Sell PUT at $[strike] / Buy PUT at $[strike]
- Why it works or doesn't: [brief reasoning based on forecast, trend, S/R]

**CALL CREDIT SPREAD EVALUATION:**
- Sell CALL at $[strike] / Buy CALL at $[strike]
- Why it works or doesn't: [brief reasoning based on forecast, trend, S/R]

**RECOMMENDATION: [PUT CREDIT SPREAD / CALL CREDIT SPREAD / IRON CONDOR / NO TRADE]**

**Setup:**
For each spread leg, specify:
- Sell [PUT/CALL] at $[strike] / Buy [PUT/CALL] at $[strike]
- Width: $[width]
- Expiration: [1W or 2W target date]
- Estimated max profit vs max loss ratio

**Why this is safe:**
- Which probability band the sold strike falls outside of
- Supporting factors (trend, S/R levels, regime)

**Risk factors:**
- What could cause the spread to be tested
- Conditions that would warrant early exit

**Confidence: [HIGH / MEDIUM / LOW]**
Based on how many signals align (trend, IV, regime, S/R levels).

Be specific with strike prices (round to nearest standard option strike). Use the actual forecast numbers. If conditions are unfavorable for credit spreads, say NO TRADE and explain why.`,
      messages: [{
        role: 'user',
        content: `Analyze this stock for safe credit spread opportunities:\n\n${dataBlock}`,
      }],
    });

    const analysis = message.content[0]?.text ?? null;
    if (!analysis) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    res.json({ analysis });
  } catch (err) {
    console.error('[spreads] Error:', err);
    res.status(500).json({ error: `Failed to generate spread analysis: ${err.message}` });
  }
});

/**
 * Build a concise data block from forecast result for the Claude prompt.
 */
function buildSpreadDataBlock(f) {
  const lines = [];

  lines.push(`TICKER: ${f.ticker}`);
  lines.push(`SPOT PRICE: $${f.spot.toFixed(2)}`);
  lines.push(`DATE: ${f.generatedAt?.slice(0, 10) || 'today'}`);
  lines.push('');

  // Trend
  lines.push(`TREND SCORE: ${f.trendScore?.toFixed(3) ?? 'N/A'} (range -1 to +1, positive = bullish)`);
  lines.push('');

  // Volatility metrics
  const vm = f.volatilityMetrics;
  if (vm) {
    lines.push('VOLATILITY METRICS:');
    lines.push(`  Current IV: ${vm.currentIVPct != null ? vm.currentIVPct + '%' : 'N/A'}`);
    lines.push(`  RV20 Annualized: ${vm.rv20AnnualizedPct != null ? vm.rv20AnnualizedPct + '%' : 'N/A'}`);
    lines.push(`  IV/RV Ratio: ${vm.ivRvRatio ?? 'N/A'}x`);
    lines.push(`  Vol Premium: ${vm.volPremium != null ? vm.volPremium + ' pp' : 'N/A'}`);
    lines.push(`  IV Percentile: ${vm.ivPercentile ?? 'N/A'}%`);
    lines.push(`  IV Rank: ${vm.ivRank ?? 'N/A'}%`);
    lines.push(`  Vol Regime: ${vm.regime ?? 'unknown'}`);
    lines.push(`  Premium Score: ${vm.premiumScore ?? 'N/A'}/100 (${vm.premiumLabel ?? 'N/A'})`);
    lines.push('');
  }

  // Horizons — focus on 1W and 2W
  lines.push('FORECAST RANGES:');
  for (const h of f.horizons) {
    if (h.horizonWeeks > 2) continue; // focus on 1W and 2W for credit spreads
    lines.push(`  ${h.horizon} (${h.targetDate || h.horizonDays + ' days'}):`);
    lines.push(`    Center: $${h.center.toFixed(2)} (drift: ${h.trendDrift >= 0 ? '+' : ''}${h.trendDrift.toFixed(2)})`);
    lines.push(`    Expected Move: $${h.expectedMove.toFixed(2)} (${h.expectedMovePct.toFixed(2)}%)`);
    lines.push(`    50% range: $${h.range50.low.toFixed(2)} – $${h.range50.high.toFixed(2)}`);
    lines.push(`    68% range: $${h.range68.low.toFixed(2)} – $${h.range68.high.toFixed(2)}`);
    lines.push(`    90% range: $${h.range90.low.toFixed(2)} – $${h.range90.high.toFixed(2)}`);
    lines.push(`    Skew: ${h.skew}`);
    lines.push(`    Confidence: ${h.confidence.toFixed(2)} (${h.confidenceLabel})`);

    // S/R levels if available
    if (h.structureData) {
      const sd = h.structureData;
      if (sd.support) lines.push(`    Nearest Support: $${typeof sd.support === 'object' ? sd.support.price?.toFixed(2) : sd.support}`);
      if (sd.resistance) lines.push(`    Nearest Resistance: $${typeof sd.resistance === 'object' ? sd.resistance.price?.toFixed(2) : sd.resistance}`);
    }
    lines.push('');
  }

  // Straddle term structure (shows market-priced expected moves)
  if (f.straddleTermStructure && f.straddleTermStructure.length > 0) {
    lines.push('ATM STRADDLE TERM STRUCTURE:');
    for (const s of f.straddleTermStructure.slice(0, 3)) {
      lines.push(`  ${s.expirationDate}: Strike $${s.strike}, Straddle $${s.straddle.toFixed(2)}, Expected Move $${s.expectedMove.toFixed(2)}`);
    }
    lines.push('');
  }

  // IV term structure
  if (f.ivTermStructure && f.ivTermStructure.length > 0) {
    lines.push('IV TERM STRUCTURE:');
    for (const iv of f.ivTermStructure.slice(0, 3)) {
      lines.push(`  ${iv.expirationDate}: IV ${(iv.iv * 100).toFixed(1)}%`);
    }
    lines.push('');
  }

  // Key indicators
  if (f.indicators) {
    lines.push('KEY INDICATORS:');
    lines.push(`  EMA20: $${f.indicators.ema20?.toFixed(2) ?? 'N/A'}`);
    lines.push(`  SMA50: $${f.indicators.sma50?.toFixed(2) ?? 'N/A'}`);
    lines.push(`  RSI14: ${f.indicators.rsi14?.toFixed(1) ?? 'N/A'}`);
    lines.push(`  ATR14: $${f.indicators.atr14?.toFixed(2) ?? 'N/A'}`);
  }

  return lines.join('\n');
}

module.exports = router;
