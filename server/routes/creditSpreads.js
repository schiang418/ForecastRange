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

module.exports = router;
