const SPREAD_WIDTH = 50; // $50 spread width

/**
 * Compute credit spread pricing for all horizons using the options chain
 * that was already fetched for the forecast.
 *
 * @param {Array} optionsChain - Full options chain from Polygon snapshot
 * @param {Array} horizons - Computed forecast horizons with range data
 * @param {number} spot - Current spot price
 * @returns {{ putSpreads, callSpreads, spreadWidth }}
 */
function computeCreditSpreadPricing(optionsChain, horizons, spot) {
  if (!optionsChain || optionsChain.length === 0) {
    return { putSpreads: [], callSpreads: [], spreadWidth: SPREAD_WIDTH };
  }

  // Index contracts by expiration → type → strike for fast lookup
  const contractIndex = {};
  for (const c of optionsChain) {
    const exp = c.details?.expiration_date;
    const type = c.details?.contract_type;
    const strike = c.details?.strike_price;
    if (!exp || !type || strike == null) continue;

    if (!contractIndex[exp]) contractIndex[exp] = { call: {}, put: {} };
    if (!contractIndex[exp][type]) contractIndex[exp][type] = {};
    contractIndex[exp][type][strike] = c;
  }

  // Get all available expirations sorted
  const availableExpirations = Object.keys(contractIndex).sort();

  const putSpreads = [];
  const callSpreads = [];

  for (const h of horizons) {
    const targetExp = h.targetDate;

    // Find the closest available expiration to the target date
    const bestExp = findClosestExpiration(availableExpirations, targetExp);

    const putRow = {
      horizon: h.horizon,
      horizonWeeks: h.horizonWeeks,
      horizonDays: h.horizonDays,
      targetDate: h.targetDate,
      expectedMove: h.expectedMove,
      expectedMovePct: h.expectedMovePct,
      expUsed: bestExp,
      ranges: {},
    };

    const callRow = { ...putRow, ranges: {} };

    if (!bestExp || !contractIndex[bestExp]) {
      putSpreads.push(putRow);
      callSpreads.push(callRow);
      continue;
    }

    const puts = contractIndex[bestExp].put || {};
    const calls = contractIndex[bestExp].call || {};
    const putStrikes = Object.keys(puts).map(Number).sort((a, b) => a - b);
    const callStrikes = Object.keys(calls).map(Number).sort((a, b) => a - b);

    for (const rangeName of ['range50', 'range68', 'range90']) {
      const range = h[rangeName];
      if (!range) continue;

      // PUT CREDIT SPREAD: sell put just below range low, buy put ~$50 lower
      const putResult = findBestSpread(puts, putStrikes, range.low, 'put', SPREAD_WIDTH);
      if (putResult) {
        putRow.ranges[rangeName] = putResult;
      }

      // CALL CREDIT SPREAD: sell call just above range high, buy call ~$50 higher
      const callResult = findBestSpread(calls, callStrikes, range.high, 'call', SPREAD_WIDTH);
      if (callResult) {
        callRow.ranges[rangeName] = callResult;
      }
    }

    putSpreads.push(putRow);
    callSpreads.push(callRow);
  }

  return { putSpreads, callSpreads, spreadWidth: SPREAD_WIDTH };
}

/**
 * Find the closest available expiration date to the target.
 */
function findClosestExpiration(expirations, targetDate) {
  if (!targetDate || expirations.length === 0) return null;

  let best = null;
  let bestDist = Infinity;
  const targetMs = new Date(targetDate).getTime();

  for (const exp of expirations) {
    const dist = Math.abs(new Date(exp).getTime() - targetMs);
    // Only consider expirations within 7 days of target
    if (dist < bestDist && dist <= 7 * 24 * 60 * 60 * 1000) {
      bestDist = dist;
      best = exp;
    }
  }

  return best;
}

/**
 * Find the best credit spread for a given boundary price.
 *
 * For puts: sell put at/below boundary, buy put ~spreadWidth lower
 * For calls: sell call at/above boundary, buy call ~spreadWidth higher
 */
function findBestSpread(contracts, sortedStrikes, boundary, type, spreadWidth) {
  if (sortedStrikes.length === 0) return null;

  // For puts: find the highest strike <= boundary (just OTM)
  // For calls: find the lowest strike >= boundary (just OTM)
  let sellStrike = null;

  if (type === 'put') {
    // Walk strikes from high to low, find first one <= boundary
    for (let i = sortedStrikes.length - 1; i >= 0; i--) {
      if (sortedStrikes[i] <= boundary) {
        sellStrike = sortedStrikes[i];
        break;
      }
    }
    // If nothing found below boundary, take the closest one above
    if (sellStrike === null) {
      sellStrike = sortedStrikes[0]; // lowest available
    }
  } else {
    // Walk strikes from low to high, find first one >= boundary
    for (let i = 0; i < sortedStrikes.length; i++) {
      if (sortedStrikes[i] >= boundary) {
        sellStrike = sortedStrikes[i];
        break;
      }
    }
    if (sellStrike === null) {
      sellStrike = sortedStrikes[sortedStrikes.length - 1]; // highest available
    }
  }

  // Find buy strike ~spreadWidth away
  const buyTarget = type === 'put' ? sellStrike - spreadWidth : sellStrike + spreadWidth;
  let buyStrike = null;
  let buyDist = Infinity;

  for (const s of sortedStrikes) {
    const dist = Math.abs(s - buyTarget);
    if (dist < buyDist) {
      buyDist = dist;
      buyStrike = s;
    }
  }

  if (buyStrike === null || buyStrike === sellStrike) return null;

  // Get prices
  const sellContract = contracts[sellStrike];
  const buyContract = contracts[buyStrike];
  if (!sellContract || !buyContract) return null;

  const sellMid = extractPrice(sellContract);
  const buyMid = extractPrice(buyContract);

  // Both prices must be available
  if (sellMid <= 0 && buyMid <= 0) return null;

  const premium = Math.round((sellMid - buyMid) * 100) / 100;
  const actualWidth = Math.abs(sellStrike - buyStrike);

  return {
    sellStrike,
    buyStrike,
    sellMid: Math.round(sellMid * 100) / 100,
    buyMid: Math.round(buyMid * 100) / 100,
    premium: Math.max(0, premium),
    premiumPerContract: Math.max(0, Math.round(premium * 100)),
    maxLoss: Math.round((actualWidth - Math.max(0, premium)) * 100),
    sellIV: sellContract.implied_volatility ?? null,
    buyIV: buyContract.implied_volatility ?? null,
  };
}

/**
 * Extract the best available price from a contract snapshot.
 * Tries multiple sources in order of reliability.
 */
function extractPrice(contract) {
  // 1. Quote midpoint
  const mid = contract.last_quote?.midpoint;
  if (mid && mid > 0) return mid;

  // 2. Compute from bid/ask
  const bid = contract.last_quote?.bid ?? 0;
  const ask = contract.last_quote?.ask ?? 0;
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  if (ask > 0) return ask / 2; // No bid, use half ask as conservative estimate

  // 3. Fair market value (Polygon-computed)
  if (contract.fair_market_value && contract.fair_market_value > 0) {
    return contract.fair_market_value;
  }

  // 4. Last trade price
  if (contract.last_trade?.price && contract.last_trade.price > 0) {
    return contract.last_trade.price;
  }

  return 0;
}

module.exports = { computeCreditSpreadPricing };
