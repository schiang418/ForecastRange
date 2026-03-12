const express = require('express');
const { fetchDailyBars, fetchOptionsChain, extractAtmIV } = require('../../src/polygon');
const { computeForecast } = require('../../src/forecast');
const { upsertIV, getIVHistory } = require('../ivHistory');
const { autoBackfillIfNeeded } = require('../ivBackfill');
const { getEasternDate, ensureIVHistoryTable } = require('../db');

const router = express.Router();

/**
 * POST /api/forecast
 * Body: { ticker: string, horizons?: number[] }
 *
 * Fetches OHLCV data and options chain from Polygon.io,
 * computes the blended forecast, and returns the full result.
 */
router.post('/', async (req, res) => {
  try {
    const { ticker, horizons } = req.body;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'ticker is required' });
    }

    // Sanitize ticker: alphanumeric only, max 10 chars
    const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10);
    if (!cleanTicker) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }

    // Date range: ~6 months back for sufficient indicator history
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    console.log(`[forecast] Fetching data for ${cleanTicker} from ${fromDate} to ${toDate}`);

    // Fetch OHLCV bars and options chain in parallel
    const [bars, optionsChain] = await Promise.all([
      fetchDailyBars(cleanTicker, fromDate, toDate),
      fetchOptionsChain(cleanTicker).catch(err => {
        console.warn(`[forecast] Options chain unavailable for ${cleanTicker}: ${err.message}`);
        return null;
      }),
    ]);

    if (!bars || bars.length === 0) {
      return res.status(404).json({ error: `No data found for ticker ${cleanTicker}` });
    }

    if (bars.length < 80) {
      return res.status(400).json({
        error: `Insufficient data for ${cleanTicker}: ${bars.length} bars (need at least 80)`,
      });
    }

    console.log(`[forecast] ${cleanTicker}: ${bars.length} bars, ${optionsChain ? optionsChain.length : 0} option contracts`);

    const spot = bars[bars.length - 1].c;

    // Auto-backfill IV history if this ticker has < 30 rows.
    // This runs synchronously on first request so the forecast immediately
    // benefits from the synthetic IV history for percentile calculations.
    let ivDbError = null;
    if (process.env.DATABASE_URL) {
      try {
        await ensureIVHistoryTable();
        await autoBackfillIfNeeded(cleanTicker, bars, optionsChain, spot);
      } catch (err) {
        ivDbError = `auto-backfill: ${err.message}`;
        console.warn(`[forecast] Auto-backfill failed for ${cleanTicker}: ${err.message}`);
      }
    } else {
      ivDbError = 'DATABASE_URL not set — IV history disabled';
      console.warn(`[forecast] DATABASE_URL not set, skipping IV history for ${cleanTicker}`);
    }

    // Fetch IV history from DB for true IV percentile calculation
    let ivHistoryRows = null;
    if (process.env.DATABASE_URL) {
      try {
        ivHistoryRows = await getIVHistory(cleanTicker, 252);
        console.log(`[forecast] ${cleanTicker}: ${ivHistoryRows.length} IV history rows`);
      } catch (err) {
        ivDbError = ivDbError || `iv-history fetch: ${err.message}`;
        console.warn(`[forecast] IV history fetch failed for ${cleanTicker}: ${err.message}`);
      }
    }

    // Compute forecast
    const result = computeForecast(bars, optionsChain, {
      horizons: horizons || [1, 2, 3, 4],
      ticker: cleanTicker,
      ivHistoryRows,
    });

    // Store today's IV snapshot for future percentile calculations (fire-and-forget)
    if (result.ivTermStructure && result.ivTermStructure.length > 0) {
      const todayIV = result.ivTermStructure[0].iv; // nearest-expiration ATM IV
      const today = getEasternDate();
      upsertIV(cleanTicker, today, todayIV, 'live').catch(err => {
        console.warn(`[forecast] IV snapshot store failed for ${cleanTicker}: ${err.message}`);
      });
    }

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    result.ticker = cleanTicker;
    if (ivDbError) {
      result.ivDbError = ivDbError;
    }
    res.json(result);
  } catch (err) {
    console.error('[forecast] Error:', err);

    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
