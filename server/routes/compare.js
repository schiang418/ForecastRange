const express = require('express');
const { fetchDailyBars, fetchOptionsChain, extractAtmIV } = require('../../src/polygon');
const { computeForecast } = require('../../src/forecast');
const { upsertIV, getIVHistory } = require('../ivHistory');
const { autoBackfillIfNeeded } = require('../ivBackfill');
const { getEasternDate, ensureIVHistoryTable } = require('../db');
const { buildComparison, generateNarrative, generatePremiumNarrative } = require('../compare');

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
 * POST /api/compare/premium-narrative
 * Body: { comparison: { tickers: [...] }, spreadsByTicker: { AAPL: {...}, ... } }
 *
 * Premium-aware AI narrative: analyzes both volatility metrics AND real
 * credit spread pricing across tickers.
 */
router.post('/premium-narrative', async (req, res) => {
  try {
    const { comparison, spreadsByTicker } = req.body;
    if (!comparison?.tickers || comparison.tickers.length < 2) {
      return res.status(400).json({ error: 'Valid comparison data required' });
    }
    if (!spreadsByTicker || typeof spreadsByTicker !== 'object') {
      return res.status(400).json({ error: 'Credit spread pricing data required' });
    }

    const narrative = await generatePremiumNarrative(comparison, spreadsByTicker);
    if (!narrative) {
      return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    res.json({ narrative });
  } catch (err) {
    console.error('[compare/premium-narrative] Error:', err);
    res.status(500).json({ error: 'Failed to generate premium-aware narrative' });
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
