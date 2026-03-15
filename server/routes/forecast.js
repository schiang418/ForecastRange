const express = require('express');
const { fetchDailyBars, fetchOptionsChain, fetchOptionsForExpiration, extractAtmIV, getOptionSnapshot, buildOptionTicker } = require('../../src/polygon');
const { computeForecast } = require('../../src/forecast');
const { upsertIV, getIVHistory } = require('../ivHistory');
const { autoBackfillIfNeeded } = require('../ivBackfill');
const { getEasternDate, ensureIVHistoryTable } = require('../db');
const { computeCreditSpreadPricing } = require('../../src/creditSpreadPricing');

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
      fetchOptionsForExpiration(cleanTicker, null, null, 4).catch(err => {
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

    // --- IV history pipeline ---
    // 1. Ensure table, 2. Store today's live IV, 3. Backfill if needed, 4. Fetch history
    let ivDbError = null;
    let ivHistoryRows = null;

    if (process.env.DATABASE_URL) {
      try {
        await ensureIVHistoryTable();

        // Store today's live IV BEFORE backfill/fetch so it's included in percentile
        if (optionsChain) {
          const expirationIVs = extractAtmIV(optionsChain, spot);
          if (expirationIVs && expirationIVs.length > 0) {
            const todayIV = expirationIVs[0].iv;
            const today = getEasternDate();
            await upsertIV(cleanTicker, today, todayIV, 'live');
          }
        }

        await autoBackfillIfNeeded(cleanTicker, bars, optionsChain, spot);
      } catch (err) {
        ivDbError = `auto-backfill: ${err.message}`;
        console.warn(`[forecast] Auto-backfill failed for ${cleanTicker}: ${err.message}`);
      }

      try {
        ivHistoryRows = await getIVHistory(cleanTicker, 252);
        console.log(`[forecast] ${cleanTicker}: ${ivHistoryRows.length} IV history rows`);
      } catch (err) {
        ivDbError = ivDbError || `iv-history fetch: ${err.message}`;
        console.warn(`[forecast] IV history fetch failed for ${cleanTicker}: ${err.message}`);
      }
    } else {
      ivDbError = 'DATABASE_URL not set — IV history disabled';
      console.warn(`[forecast] DATABASE_URL not set, skipping IV history for ${cleanTicker}`);
    }

    // Compute forecast
    const result = computeForecast(bars, optionsChain, {
      horizons: horizons || [1, 2, 3, 4],
      ticker: cleanTicker,
      ivHistoryRows,
    });

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

/**
 * GET /api/forecast/debug-option
 * Test endpoint to see raw Polygon API response for a single option contract.
 * Usage: /api/forecast/debug-option?ticker=TSLA&strike=370&exp=2026-03-20&type=P
 */
router.get('/debug-option', async (req, res) => {
  try {
    const { ticker, strike, exp, type } = req.query;
    if (!ticker || !strike || !exp || !type) {
      return res.status(400).json({ error: 'Need ticker, strike, exp, type params' });
    }

    const putCall = String(type).toUpperCase();
    const optionTicker = buildOptionTicker(String(ticker).toUpperCase(), String(exp), putCall, Number(strike));

    // Try both API keys
    const stockKey = process.env.MASSIVE_STOCK_API_KEY;
    const optionKey = process.env.MASSIVE_API_KEY;

    const results = {};

    // Test with MASSIVE_STOCK_API_KEY
    if (stockKey) {
      const url = `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionTicker}?apiKey=${stockKey}`;
      const r = await fetch(url);
      results.stockKey = { status: r.status, body: r.ok ? await r.json() : await r.text() };
    }

    // Test with MASSIVE_API_KEY (if different)
    if (optionKey && optionKey !== stockKey) {
      const url = `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionTicker}?apiKey=${optionKey}`;
      const r = await fetch(url);
      results.optionKey = { status: r.status, body: r.ok ? await r.json() : await r.text() };
    }

    // Also try prev close
    const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/prev?adjusted=true&apiKey=${stockKey || optionKey}`;
    const prevRes = await fetch(prevUrl);
    results.prevClose = { status: prevRes.status, body: prevRes.ok ? await prevRes.json() : await prevRes.text() };

    res.json({
      optionTicker,
      envVars: {
        MASSIVE_STOCK_API_KEY: stockKey ? `${stockKey.slice(0, 4)}...${stockKey.slice(-4)}` : 'NOT SET',
        MASSIVE_API_KEY: optionKey ? `${optionKey.slice(0, 4)}...${optionKey.slice(-4)}` : 'NOT SET',
        sameKey: stockKey === optionKey,
      },
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/forecast/credit-spreads
 * Body: { ticker: string, horizons: ForecastHorizon[], spot: number }
 *
 * On-demand credit spread pricing — fetches full options chain and
 * individual contract snapshots for accurate OTM pricing.
 */
router.post('/credit-spreads', async (req, res) => {
  try {
    const { ticker, horizons, spot } = req.body;

    if (!ticker || !horizons || !spot) {
      return res.status(400).json({ error: 'ticker, horizons, and spot are required' });
    }

    const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10);
    console.log(`[credit-spreads] Fetching for ${cleanTicker}, spot=${spot}`);

    // Fetch full options chain with pagination for strike discovery
    const fullChain = await fetchOptionsForExpiration(cleanTicker).catch(err => {
      console.warn(`[credit-spreads] Full chain fetch failed: ${err.message}`);
      return [];
    });

    // Fall back to basic chain if full fetch fails
    let chainToUse = fullChain;
    if (!chainToUse || chainToUse.length === 0) {
      chainToUse = await fetchOptionsChain(cleanTicker).catch(() => []);
    }

    console.log(`[credit-spreads] ${cleanTicker}: ${chainToUse.length} contracts`);

    if (chainToUse.length === 0) {
      return res.status(404).json({ error: `No options data for ${cleanTicker}` });
    }

    const result = await computeCreditSpreadPricing(
      chainToUse, horizons, spot, cleanTicker, getOptionSnapshot, buildOptionTicker
    );

    res.json(result);
  } catch (err) {
    console.error('[credit-spreads] Error:', err);
    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/forecast/credit-spreads/batch
 * Body: { tickers: [{ ticker, spot, horizons }] }
 *
 * Fetches credit spread pricing for multiple tickers sequentially.
 * Used by the Compare screen's "Analyze with Pricing" feature.
 */
router.post('/credit-spreads/batch', async (req, res) => {
  try {
    const { tickers } = req.body;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: 'tickers array is required' });
    }

    console.log(`[credit-spreads/batch] Processing ${tickers.length} tickers: ${tickers.map(t => t.ticker).join(', ')}`);

    const results = {};
    const failed = [];

    for (const { ticker, spot, horizons } of tickers) {
      try {
        const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10);
        console.log(`[credit-spreads/batch] Fetching ${cleanTicker}, spot=${spot}, horizons=${horizons.length}`);

        const fullChain = await fetchOptionsForExpiration(cleanTicker).catch(err => {
          console.warn(`[credit-spreads/batch] Full chain fetch failed for ${cleanTicker}: ${err.message}`);
          return [];
        });

        let chainToUse = fullChain;
        if (!chainToUse || chainToUse.length === 0) {
          chainToUse = await fetchOptionsChain(cleanTicker).catch(() => []);
        }

        console.log(`[credit-spreads/batch] ${cleanTicker}: ${chainToUse.length} contracts`);

        if (chainToUse.length === 0) {
          failed.push({ ticker: cleanTicker, error: `No options data for ${cleanTicker}` });
          continue;
        }

        const result = await computeCreditSpreadPricing(
          chainToUse, horizons, spot, cleanTicker, getOptionSnapshot, buildOptionTicker
        );
        results[cleanTicker] = result;
        console.log(`[credit-spreads/batch] ${cleanTicker}: done (${result.putSpreads.length} put rows, ${result.callSpreads.length} call rows)`);
      } catch (err) {
        console.error(`[credit-spreads/batch] Error for ${ticker}: ${err.message}`);
        failed.push({ ticker, error: err.message });
      }
    }

    console.log(`[credit-spreads/batch] Complete: ${Object.keys(results).length} succeeded, ${failed.length} failed`);
    res.json({ results, failed: failed.length > 0 ? failed : undefined });
  } catch (err) {
    console.error('[credit-spreads/batch] Error:', err);
    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
