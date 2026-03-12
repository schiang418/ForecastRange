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
 * Body: { tickers: string[] }  (max 5)
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
    if (tickers.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 tickers allowed' });
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

    // Generate AI narrative (non-blocking — if it fails, we still return data)
    let narrative = null;
    try {
      narrative = await generateNarrative(comparison);
    } catch (err) {
      console.warn(`[compare] Narrative generation failed: ${err.message}`);
    }

    res.json({
      comparison,
      narrative,
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

module.exports = router;
