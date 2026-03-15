const express = require('express');
const { fetchOptionsForExpiration, findContractPrice, roundToStrike } = require('../../src/polygon');

const router = express.Router();

const SPREAD_WIDTH = 50; // $50 spread width

/**
 * POST /api/forecast/credit-spread-pricing
 * Body: { ticker, spot, horizons: ForecastHorizon[] }
 *
 * For each horizon and range (50%, 68%, 90%), fetches real options pricing
 * to calculate put and call credit spread premiums.
 */
router.post('/', async (req, res) => {
  try {
    const { ticker, spot, horizons } = req.body;

    if (!ticker || !spot || !horizons?.length) {
      return res.status(400).json({ error: 'ticker, spot, and horizons are required' });
    }

    console.log(`[credit-spreads] Computing spreads for ${ticker} at $${spot}`);

    // Collect unique expiration dates from horizons
    const expirations = [...new Set(horizons.map(h => h.targetDate).filter(Boolean))];

    // Fetch options chains for all relevant expirations in parallel (puts + calls)
    const chainsByExpiration = {};
    await Promise.all(expirations.map(async (exp) => {
      const [puts, calls] = await Promise.all([
        fetchOptionsForExpiration(ticker, exp, 'put').catch(() => []),
        fetchOptionsForExpiration(ticker, exp, 'call').catch(() => []),
      ]);
      chainsByExpiration[exp] = { puts, calls };
      console.log(`[credit-spreads] ${ticker} exp=${exp}: ${puts.length} puts, ${calls.length} calls`);
    }));

    // For each horizon, compute credit spread pricing for each range
    const putSpreads = [];
    const callSpreads = [];

    for (const h of horizons) {
      const exp = h.targetDate;
      const chains = chainsByExpiration[exp] || { puts: [], calls: [] };

      const putRow = {
        horizon: h.horizon,
        horizonWeeks: h.horizonWeeks,
        horizonDays: h.horizonDays,
        targetDate: h.targetDate,
        expectedMove: h.expectedMove,
        expectedMovePct: h.expectedMovePct,
        ranges: {},
      };

      const callRow = {
        horizon: h.horizon,
        horizonWeeks: h.horizonWeeks,
        horizonDays: h.horizonDays,
        targetDate: h.targetDate,
        expectedMove: h.expectedMove,
        expectedMovePct: h.expectedMovePct,
        ranges: {},
      };

      for (const rangeName of ['range50', 'range68', 'range90']) {
        const range = h[rangeName];
        if (!range) continue;

        // PUT CREDIT SPREAD: sell put just below range low, buy put ~$50 lower
        const putSellTarget = roundToStrike(range.low, 'down');
        const putBuyTarget = putSellTarget - SPREAD_WIDTH;

        if (putBuyTarget > 0) {
          const sellPut = findContractPrice(chains.puts, putSellTarget, 'put', 10);
          const buyPut = sellPut
            ? findContractPrice(chains.puts, sellPut.strike - SPREAD_WIDTH, 'put', 10)
            : null;

          if (sellPut && buyPut && sellPut.strike !== buyPut.strike) {
            const premium = Math.round((sellPut.mid - buyPut.mid) * 100) / 100;
            const actualWidth = sellPut.strike - buyPut.strike;
            putRow.ranges[rangeName] = {
              sellStrike: sellPut.strike,
              buyStrike: buyPut.strike,
              sellMid: sellPut.mid,
              buyMid: buyPut.mid,
              premium: Math.max(0, premium),
              premiumPerContract: Math.max(0, Math.round(premium * 100)),
              maxLoss: Math.round((actualWidth - Math.max(0, premium)) * 100),
              sellIV: sellPut.iv,
              buyIV: buyPut.iv,
            };
          }
        }

        // CALL CREDIT SPREAD: sell call just above range high, buy call ~$50 higher
        const callSellTarget = roundToStrike(range.high, 'up');

        const sellCall = findContractPrice(chains.calls, callSellTarget, 'call', 10);
        const buyCall = sellCall
          ? findContractPrice(chains.calls, sellCall.strike + SPREAD_WIDTH, 'call', 10)
          : null;

        if (sellCall && buyCall && sellCall.strike !== buyCall.strike) {
          const premium = Math.round((sellCall.mid - buyCall.mid) * 100) / 100;
          const actualWidth = buyCall.strike - sellCall.strike;
          callRow.ranges[rangeName] = {
            sellStrike: sellCall.strike,
            buyStrike: buyCall.strike,
            sellMid: sellCall.mid,
            buyMid: buyCall.mid,
            premium: Math.max(0, premium),
            premiumPerContract: Math.max(0, Math.round(premium * 100)),
            maxLoss: Math.round((actualWidth - Math.max(0, premium)) * 100),
            sellIV: sellCall.iv,
            buyIV: buyCall.iv,
          };
        }
      }

      putSpreads.push(putRow);
      callSpreads.push(callRow);
    }

    res.json({ putSpreads, callSpreads, spreadWidth: SPREAD_WIDTH });
  } catch (err) {
    console.error('[credit-spreads] Error:', err);

    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
    }

    res.status(500).json({ error: `Failed to compute credit spreads: ${err.message}` });
  }
});

/**
 * POST /api/forecast/credit-spreads/batch
 * Body: { tickers: [{ ticker, spot, horizons }] }
 *
 * Fetches credit spread pricing for multiple tickers SEQUENTIALLY
 * to avoid hitting Polygon rate limits. Each ticker is processed
 * one at a time with a delay between them.
 */
router.post('/batch', async (req, res) => {
  try {
    const { tickers } = req.body;

    if (!Array.isArray(tickers) || tickers.length < 1) {
      return res.status(400).json({ error: 'tickers array required' });
    }
    if (tickers.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 tickers allowed' });
    }

    console.log(`[credit-spreads/batch] Processing ${tickers.length} tickers sequentially`);

    const results = {};
    const failed = [];
    const INTER_TICKER_DELAY = 1500; // 1.5s between tickers to stay under rate limits

    for (let i = 0; i < tickers.length; i++) {
      const { ticker, spot, horizons } = tickers[i];

      if (!ticker || !spot || !horizons?.length) {
        failed.push({ ticker: ticker || `index_${i}`, error: 'Missing ticker, spot, or horizons' });
        continue;
      }

      // Delay between tickers (not before the first one)
      if (i > 0) {
        await new Promise(r => setTimeout(r, INTER_TICKER_DELAY));
      }

      try {
        console.log(`[credit-spreads/batch] [${i + 1}/${tickers.length}] Fetching ${ticker}...`);

        // Focus on 1W and 2W only to reduce API calls
        const shortHorizons = horizons.filter(h => h.horizonWeeks <= 2);
        const expirations = [...new Set(shortHorizons.map(h => h.targetDate).filter(Boolean))];

        const chainsByExpiration = {};
        // Fetch expirations sequentially per ticker to be rate-limit safe
        for (const exp of expirations) {
          const [puts, calls] = await Promise.all([
            fetchOptionsForExpiration(ticker, exp, 'put').catch(() => []),
            fetchOptionsForExpiration(ticker, exp, 'call').catch(() => []),
          ]);
          chainsByExpiration[exp] = { puts, calls };
          console.log(`[credit-spreads/batch] ${ticker} exp=${exp}: ${puts.length} puts, ${calls.length} calls`);
          // Log first contract's price fields for debugging
          const sample = puts[0] || calls[0];
          if (sample) {
            console.log(`[credit-spreads/batch] ${ticker} sample contract price fields:`, JSON.stringify({
              last_quote: sample.last_quote,
              fair_market_value: sample.fair_market_value,
              last_trade: sample.last_trade ? { price: sample.last_trade.price } : null,
              day: sample.day ? { close: sample.day.close, last_trade_price: sample.day.last_trade_price } : null,
              prev_day: sample.prev_day ? { close: sample.prev_day.close } : null,
              implied_volatility: sample.implied_volatility,
            }));
          }
          // Small delay between expirations within a ticker
          await new Promise(r => setTimeout(r, 300));
        }

        const putSpreads = [];
        const callSpreads = [];

        for (const h of shortHorizons) {
          const exp = h.targetDate;
          const chains = chainsByExpiration[exp] || { puts: [], calls: [] };

          const putRow = {
            horizon: h.horizon,
            horizonWeeks: h.horizonWeeks,
            horizonDays: h.horizonDays,
            targetDate: h.targetDate,
            expectedMove: h.expectedMove,
            expectedMovePct: h.expectedMovePct,
            ranges: {},
          };
          const callRow = { ...putRow, ranges: {} };

          for (const rangeName of ['range50', 'range68', 'range90']) {
            const range = h[rangeName];
            if (!range) continue;

            // PUT CREDIT SPREAD
            const putSellTarget = roundToStrike(range.low, 'down');
            if (putSellTarget - SPREAD_WIDTH > 0) {
              const sellPut = findContractPrice(chains.puts, putSellTarget, 'put', 10);
              const buyPut = sellPut
                ? findContractPrice(chains.puts, sellPut.strike - SPREAD_WIDTH, 'put', 10)
                : null;
              if (sellPut && buyPut && sellPut.strike !== buyPut.strike) {
                const premium = Math.round((sellPut.mid - buyPut.mid) * 100) / 100;
                const actualWidth = sellPut.strike - buyPut.strike;
                putRow.ranges[rangeName] = {
                  sellStrike: sellPut.strike,
                  buyStrike: buyPut.strike,
                  sellMid: sellPut.mid,
                  buyMid: buyPut.mid,
                  premium: Math.max(0, premium),
                  premiumPerContract: Math.max(0, Math.round(premium * 100)),
                  maxLoss: Math.round((actualWidth - Math.max(0, premium)) * 100),
                  sellIV: sellPut.iv,
                  buyIV: buyPut.iv,
                };
              }
            }

            // CALL CREDIT SPREAD
            const callSellTarget = roundToStrike(range.high, 'up');
            const sellCall = findContractPrice(chains.calls, callSellTarget, 'call', 10);
            const buyCall = sellCall
              ? findContractPrice(chains.calls, sellCall.strike + SPREAD_WIDTH, 'call', 10)
              : null;
            if (sellCall && buyCall && sellCall.strike !== buyCall.strike) {
              const premium = Math.round((sellCall.mid - buyCall.mid) * 100) / 100;
              const actualWidth = buyCall.strike - sellCall.strike;
              callRow.ranges[rangeName] = {
                sellStrike: sellCall.strike,
                buyStrike: buyCall.strike,
                sellMid: sellCall.mid,
                buyMid: buyCall.mid,
                premium: Math.max(0, premium),
                premiumPerContract: Math.max(0, Math.round(premium * 100)),
                maxLoss: Math.round((actualWidth - Math.max(0, premium)) * 100),
                sellIV: sellCall.iv,
                buyIV: buyCall.iv,
              };
            }
          }

          putSpreads.push(putRow);
          callSpreads.push(callRow);
        }

        // Collect debug info: what expirations were fetched, how many contracts, sample pricing fields
        const _debug = {
          expirations: Object.entries(chainsByExpiration).map(([exp, chains]) => ({
            exp,
            puts: chains.puts.length,
            calls: chains.calls.length,
            samplePut: chains.puts[0] ? {
              strike: chains.puts[0].details?.strike_price,
              last_quote: chains.puts[0].last_quote,
              fair_market_value: chains.puts[0].fair_market_value,
              last_trade_price: chains.puts[0].last_trade?.price,
              day_close: chains.puts[0].day?.close,
              prev_day_close: chains.puts[0].prev_day?.close,
              implied_volatility: chains.puts[0].implied_volatility,
            } : null,
          })),
        };
        results[ticker] = { putSpreads, callSpreads, spreadWidth: SPREAD_WIDTH, _debug };
        console.log(`[credit-spreads/batch] ${ticker} done (${putSpreads.length} horizons)`);
      } catch (err) {
        console.warn(`[credit-spreads/batch] ${ticker} failed: ${err.message}`);
        failed.push({ ticker, error: err.message });
      }
    }

    res.json({ results, failed: failed.length > 0 ? failed : undefined });
  } catch (err) {
    console.error('[credit-spreads/batch] Error:', err);
    res.status(500).json({ error: `Failed to compute batch credit spreads: ${err.message}` });
  }
});

module.exports = router;
