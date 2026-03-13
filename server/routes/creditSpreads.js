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

        // PUT CREDIT SPREAD: sell put just below range low, buy put $50 lower
        const putSellStrike = roundToStrike(range.low, 'down');
        const putBuyStrike = putSellStrike - SPREAD_WIDTH;

        if (putBuyStrike > 0) {
          const sellPut = findContractPrice(chains.puts, putSellStrike, 'put');
          const buyPut = findContractPrice(chains.puts, putBuyStrike, 'put');

          if (sellPut && buyPut) {
            const premium = Math.round((sellPut.mid - buyPut.mid) * 100) / 100;
            putRow.ranges[rangeName] = {
              sellStrike: putSellStrike,
              buyStrike: putBuyStrike,
              sellMid: sellPut.mid,
              buyMid: buyPut.mid,
              premium,
              premiumPerContract: Math.round(premium * 100), // in dollars (1 contract = 100 shares)
              maxLoss: Math.round((SPREAD_WIDTH - premium) * 100),
              sellIV: sellPut.iv,
              buyIV: buyPut.iv,
            };
          } else {
            // Try nearby strikes if exact not found
            const altResult = findNearbySpread(chains.puts, putSellStrike, putBuyStrike, 'put', SPREAD_WIDTH);
            putRow.ranges[rangeName] = altResult;
          }
        }

        // CALL CREDIT SPREAD: sell call just above range high, buy call $50 higher
        const callSellStrike = roundToStrike(range.high, 'up');
        const callBuyStrike = callSellStrike + SPREAD_WIDTH;

        const sellCall = findContractPrice(chains.calls, callSellStrike, 'call');
        const buyCall = findContractPrice(chains.calls, callBuyStrike, 'call');

        if (sellCall && buyCall) {
          const premium = Math.round((sellCall.mid - buyCall.mid) * 100) / 100;
          callRow.ranges[rangeName] = {
            sellStrike: callSellStrike,
            buyStrike: callBuyStrike,
            sellMid: sellCall.mid,
            buyMid: buyCall.mid,
            premium,
            premiumPerContract: Math.round(premium * 100),
            maxLoss: Math.round((SPREAD_WIDTH - premium) * 100),
            sellIV: sellCall.iv,
            buyIV: buyCall.iv,
          };
        } else {
          const altResult = findNearbySpread(chains.calls, callSellStrike, callBuyStrike, 'call', SPREAD_WIDTH);
          callRow.ranges[rangeName] = altResult;
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
 * Try to find a nearby spread when exact strikes aren't available.
 * Searches within $10 of the target strikes.
 */
function findNearbySpread(contracts, targetSellStrike, targetBuyStrike, contractType, spreadWidth) {
  // Get all available strikes
  const availableStrikes = [...new Set(
    contracts
      .filter(c => c.details?.contract_type === contractType && c.details?.strike_price != null)
      .map(c => c.details.strike_price)
  )].sort((a, b) => a - b);

  if (availableStrikes.length === 0) return null;

  // Find the closest sell strike to our target
  let bestSell = null;
  let minDist = Infinity;
  for (const s of availableStrikes) {
    const dist = Math.abs(s - targetSellStrike);
    if (dist < minDist && dist <= 10) {
      minDist = dist;
      bestSell = s;
    }
  }

  if (bestSell === null) return null;

  // Find a buy strike that's approximately spreadWidth away
  const targetBuy = contractType === 'put' ? bestSell - spreadWidth : bestSell + spreadWidth;
  let bestBuy = null;
  minDist = Infinity;
  for (const s of availableStrikes) {
    const dist = Math.abs(s - targetBuy);
    if (dist < minDist && dist <= 15) {
      minDist = dist;
      bestBuy = s;
    }
  }

  if (bestBuy === null) return null;

  const sellContract = findContractPrice(contracts, bestSell, contractType);
  const buyContract = findContractPrice(contracts, bestBuy, contractType);

  if (!sellContract || !buyContract) return null;

  const actualWidth = Math.abs(bestSell - bestBuy);
  const premium = Math.round((sellContract.mid - buyContract.mid) * 100) / 100;

  return {
    sellStrike: bestSell,
    buyStrike: bestBuy,
    sellMid: sellContract.mid,
    buyMid: buyContract.mid,
    premium,
    premiumPerContract: Math.round(premium * 100),
    maxLoss: Math.round((actualWidth - premium) * 100),
    sellIV: sellContract.iv,
    buyIV: buyContract.iv,
    adjusted: true, // flag that strikes were adjusted from ideal
  };
}

module.exports = router;
