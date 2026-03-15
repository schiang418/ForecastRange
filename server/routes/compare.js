const express = require('express');
const { fetchDailyBars, fetchOptionsChain, extractAtmIV } = require('../../src/polygon');
const { computeForecast } = require('../../src/forecast');
const { upsertIV, getIVHistory } = require('../ivHistory');
const { autoBackfillIfNeeded } = require('../ivBackfill');
const { getEasternDate, ensureIVHistoryTable } = require('../db');
const { buildComparison, generateNarrative } = require('../compare');

const router = express.Router();

/**
 * POST /api/compare
 * Body: { tickers: string[] }  (max 10)
 *
 * Runs forecast on each ticker in parallel, then ranks them
 * for premium selling attractiveness.
 */
router.post('/', async (req, res) => {
  try {
    const { tickers } = req.body;

    if (!Array.isArray(tickers) || tickers.length < 2) {
      return res.status(400).json({ error: 'At least 2 tickers required' });
    }
    if (tickers.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 tickers allowed' });
    }

    // Sanitize tickers
    const cleanTickers = tickers
      .map(t => (typeof t === 'string' ? t : '').toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10))
      .filter(t => t.length > 0);

    if (cleanTickers.length < 2) {
      return res.status(400).json({ error: 'At least 2 valid tickers required' });
    }

    // Deduplicate
    const uniqueTickers = [...new Set(cleanTickers)];

    console.log(`[compare] Comparing ${uniqueTickers.length} tickers: ${uniqueTickers.join(', ')}`);

    // Run all forecasts in parallel
    const forecastPromises = uniqueTickers.map(ticker => runSingleForecast(ticker));
    const results = await Promise.all(forecastPromises);

    // Filter out failures
    const successful = results.filter(r => r.result && !r.result.error);
    const failed = results.filter(r => r.error || r.result?.error);

    if (successful.length < 2) {
      return res.status(400).json({
        error: `Need at least 2 successful forecasts. ${failed.length} ticker(s) failed.`,
        failed: failed.map(f => ({ ticker: f.ticker, error: f.error || f.result?.error })),
      });
    }

    // Build hardcoded comparison
    const comparison = buildComparison(successful);

    res.json({
      comparison,
      narrative: null,
      failed: failed.length > 0
        ? failed.map(f => ({ ticker: f.ticker, error: f.error || f.result?.error }))
        : undefined,
    });
  } catch (err) {
    console.error('[compare] Error:', err);
    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/compare/narrative
 * Body: { comparison: { tickers: [...] } }
 *
 * Generates AI narrative from an existing comparison result.
 * Separate endpoint so it's only called on user request.
 */
router.post('/narrative', async (req, res) => {
  try {
    const { comparison } = req.body;
    if (!comparison?.tickers || comparison.tickers.length < 2) {
      return res.status(400).json({ error: 'Valid comparison data required' });
    }

    const narrative = await generateNarrative(comparison);
    if (!narrative) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    res.json({ narrative });
  } catch (err) {
    console.error('[compare/narrative] Error:', err);
    res.status(500).json({ error: 'Failed to generate narrative' });
  }
});

/**
 * Run a single forecast for a ticker (same logic as forecast route).
 * Returns { ticker, result } on success or { ticker, error } on failure.
 */
async function runSingleForecast(ticker) {
  try {
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [bars, optionsChain] = await Promise.all([
      fetchDailyBars(ticker, fromDate, toDate),
      fetchOptionsChain(ticker).catch(() => null),
    ]);

    if (!bars || bars.length < 80) {
      return { ticker, error: `Insufficient data: ${bars?.length ?? 0} bars` };
    }

    const spot = bars[bars.length - 1].c;

    // IV pipeline
    let ivHistoryRows = null;
    if (process.env.DATABASE_URL) {
      try {
        await ensureIVHistoryTable();
        if (optionsChain) {
          const expirationIVs = extractAtmIV(optionsChain, spot);
          if (expirationIVs && expirationIVs.length > 0) {
            const todayIV = expirationIVs[0].iv;
            const today = getEasternDate();
            await upsertIV(ticker, today, todayIV, 'live');
          }
        }
        await autoBackfillIfNeeded(ticker, bars, optionsChain, spot);
      } catch (err) {
        console.warn(`[compare] IV pipeline failed for ${ticker}: ${err.message}`);
      }
      try {
        ivHistoryRows = await getIVHistory(ticker, 252);
      } catch (err) {
        console.warn(`[compare] IV history fetch failed for ${ticker}: ${err.message}`);
      }
    }

    const result = computeForecast(bars, optionsChain, {
      horizons: [1, 2, 3, 4],
      ticker,
      ivHistoryRows,
    });

    if (result.error) {
      return { ticker, error: result.error };
    }

    result.ticker = ticker;
    return { ticker, result };
  } catch (err) {
    return { ticker, error: err.message };
  }
}

/**
 * POST /api/compare/premium-narrative
 * Body: { comparison: { tickers: [...] }, spreadsByTicker: { AAPL: {...}, ... } }
 *
 * Generates AI narrative using both comparison data and real credit spread pricing.
 */
router.post('/premium-narrative', async (req, res) => {
  try {
    const { comparison, spreadsByTicker } = req.body;
    if (!comparison?.tickers || comparison.tickers.length < 2) {
      return res.status(400).json({ error: 'Valid comparison data required' });
    }
    if (!spreadsByTicker || Object.keys(spreadsByTicker).length === 0) {
      return res.status(400).json({ error: 'Credit spread pricing data required' });
    }

    console.log(`[compare/premium-narrative] Generating for ${comparison.tickers.length} tickers with pricing data for: ${Object.keys(spreadsByTicker).join(', ')}`);

    const narrative = await generatePremiumNarrative(comparison, spreadsByTicker);
    if (!narrative) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    console.log(`[compare/premium-narrative] Done, narrative length: ${narrative.length}`);
    res.json({ narrative });
  } catch (err) {
    console.error('[compare/premium-narrative] Error:', err);
    res.status(500).json({ error: 'Failed to generate premium-aware narrative' });
  }
});

/**
 * Generate a premium-aware AI narrative using Claude API.
 * Includes real credit spread pricing in the analysis.
 */
async function generatePremiumNarrative(comparison, spreadsByTicker) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const tickerSummaries = comparison.tickers.map(t => {
      let summary =
        `${t.ticker} (Rank #${t.rank}): ` +
        `IV=${t.currentIV ?? 'N/A'}%, RV=${t.rv20 ?? 'N/A'}%, ` +
        `IV/RV=${t.ivRvRatio ?? 'N/A'}x, ` +
        `IV Pctl=${t.ivPercentile ?? 'N/A'}%, IV Rank=${t.ivRank ?? 'N/A'}%, ` +
        `Regime=${t.regime}, Premium Score=${t.premiumScore ?? 'N/A'}/100 (${t.premiumLabel ?? 'N/A'}), ` +
        `1W Expected Move=${t.weekMove ?? 'N/A'}%, Trend Score=${t.trendScore != null ? t.trendScore.toFixed(3) : 'N/A'}, ` +
        `Skew=${t.weekSkew ?? 'N/A'}`;

      // Add pricing data if available
      const spreads = spreadsByTicker[t.ticker];
      if (spreads) {
        const putRow = spreads.putSpreads?.[0]; // 1W horizon
        const callRow = spreads.callSpreads?.[0];
        if (putRow) {
          const r68 = putRow.ranges?.range68;
          if (r68) {
            summary += ` | 1W Put Spread (68%): Sell $${r68.sellStrike}/Buy $${r68.buyStrike}, Premium $${r68.premiumPerContract}/contract`;
          }
        }
        if (callRow) {
          const r68 = callRow.ranges?.range68;
          if (r68) {
            summary += ` | 1W Call Spread (68%): Sell $${r68.sellStrike}/Buy $${r68.buyStrike}, Premium $${r68.premiumPerContract}/contract`;
          }
        }
      }

      return summary;
    }).join('\n');

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: `You are a concise options analyst specializing in premium selling strategies.
Write a 2-4 paragraph comparison of the tickers below for a trader looking to sell options premium.
You have REAL credit spread pricing data — use actual premiums and dollar amounts in your analysis.
Focus on: which ticker offers the best risk/reward for premium selling and why,
key differences in their volatility profiles, actual premium available, and any warnings.
Be direct and actionable. Use specific numbers from the data. Do not use headers or bullet points.`,
      messages: [{
        role: 'user',
        content: `Compare these tickers for premium selling (includes live option pricing):\n\n${tickerSummaries}`,
      }],
    });

    return message.content[0]?.text ?? null;
  } catch (err) {
    console.warn(`[compare/premium-narrative] Claude API failed: ${err.message}`);
    return null;
  }
}

module.exports = router;
