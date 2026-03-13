const SPREAD_WIDTH = 50; // $50 spread width

/**
 * Compute credit spread pricing for all horizons using the options chain
 * that was already fetched for the forecast.
 *
 * @param {Array} optionsChain - Full options chain from Polygon snapshot
 * @param {Array} horizons - Computed forecast horizons with range data
 * @param {number} spot - Current spot price
 * @returns {{ putSpreads, callSpreads, spreadWidth, _debug }}
 */
function computeCreditSpreadPricing(optionsChain, horizons, spot) {
  const _debug = {
    totalContracts: optionsChain ? optionsChain.length : 0,
    indexedContracts: 0,
    expirations: [],
    horizonResults: [],
  };

  if (!optionsChain || optionsChain.length === 0) {
    _debug.error = 'No options chain data';
    return { putSpreads: [], callSpreads: [], spreadWidth: SPREAD_WIDTH, _debug };
  }

  // Index contracts by expiration → type → strike for fast lookup
  const contractIndex = {};
  let skipped = 0;
  for (const c of optionsChain) {
    const exp = c.details?.expiration_date;
    const type = c.details?.contract_type;
    const strike = c.details?.strike_price;
    if (!exp || !type || strike == null) {
      skipped++;
      continue;
    }

    if (!contractIndex[exp]) contractIndex[exp] = { call: {}, put: {} };
    if (!contractIndex[exp][type]) contractIndex[exp][type] = {};
    contractIndex[exp][type][strike] = c;
    _debug.indexedContracts++;
  }
  _debug.skippedContracts = skipped;

  // Sample a contract to show its structure (for debugging)
  if (optionsChain.length > 0) {
    const sample = optionsChain[0];
    _debug.sampleContract = {
      hasDetails: !!sample.details,
      detailKeys: sample.details ? Object.keys(sample.details) : [],
      hasLastQuote: !!sample.last_quote,
      quoteKeys: sample.last_quote ? Object.keys(sample.last_quote) : [],
      hasLastTrade: !!sample.last_trade,
      hasFMV: !!sample.fair_market_value,
      hasImpliedVol: !!sample.implied_volatility,
      topLevelKeys: Object.keys(sample),
    };
  }

  // Get all available expirations sorted
  const availableExpirations = Object.keys(contractIndex).sort();

  // Build expiration debug info
  for (const exp of availableExpirations.slice(0, 6)) {
    const putStrikes = Object.keys(contractIndex[exp].put || {}).map(Number).sort((a, b) => a - b);
    const callStrikes = Object.keys(contractIndex[exp].call || {}).map(Number).sort((a, b) => a - b);
    _debug.expirations.push({
      exp,
      puts: putStrikes.length,
      calls: callStrikes.length,
      putRange: putStrikes.length > 0 ? `${putStrikes[0]}-${putStrikes[putStrikes.length-1]}` : 'none',
      callRange: callStrikes.length > 0 ? `${callStrikes[0]}-${callStrikes[callStrikes.length-1]}` : 'none',
    });
  }

  const putSpreads = [];
  const callSpreads = [];

  for (const h of horizons) {
    const targetExp = h.targetDate;
    const bestExp = findClosestExpiration(availableExpirations, targetExp);

    const horizonDebug = {
      horizon: h.horizon,
      targetDate: targetExp,
      bestExp,
      ranges: {},
    };

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
      horizonDebug.error = !bestExp ? 'No matching expiration found' : 'No contracts for expiration';
      _debug.horizonResults.push(horizonDebug);
      putSpreads.push(putRow);
      callSpreads.push(callRow);
      continue;
    }

    const puts = contractIndex[bestExp].put || {};
    const calls = contractIndex[bestExp].call || {};
    const putStrikes = Object.keys(puts).map(Number).sort((a, b) => a - b);
    const callStrikes = Object.keys(calls).map(Number).sort((a, b) => a - b);

    horizonDebug.putStrikesCount = putStrikes.length;
    horizonDebug.callStrikesCount = callStrikes.length;
    horizonDebug.putStrikeRange = putStrikes.length > 0 ? `${putStrikes[0]}-${putStrikes[putStrikes.length-1]}` : 'none';
    horizonDebug.callStrikeRange = callStrikes.length > 0 ? `${callStrikes[0]}-${callStrikes[callStrikes.length-1]}` : 'none';

    for (const rangeName of ['range50', 'range68', 'range90']) {
      const range = h[rangeName];
      if (!range) {
        horizonDebug.ranges[rangeName] = { error: 'No range data' };
        continue;
      }

      const rangeDebug = { low: range.low, high: range.high };

      // PUT CREDIT SPREAD: sell put just below range low, buy put ~$50 lower
      const putResult = findBestSpread(puts, putStrikes, range.low, 'put', SPREAD_WIDTH);
      if (putResult) {
        if (putResult._debug) {
          rangeDebug.putDebug = putResult._debug;
          delete putResult._debug;
        }
        putRow.ranges[rangeName] = putResult;
      } else {
        // Get more detail on why it failed
        rangeDebug.putDebug = debugFindBestSpread(puts, putStrikes, range.low, 'put', SPREAD_WIDTH);
      }

      // CALL CREDIT SPREAD: sell call just above range high, buy call ~$50 higher
      const callResult = findBestSpread(calls, callStrikes, range.high, 'call', SPREAD_WIDTH);
      if (callResult) {
        if (callResult._debug) {
          rangeDebug.callDebug = callResult._debug;
          delete callResult._debug;
        }
        callRow.ranges[rangeName] = callResult;
      } else {
        rangeDebug.callDebug = debugFindBestSpread(calls, callStrikes, range.high, 'call', SPREAD_WIDTH);
      }

      horizonDebug.ranges[rangeName] = rangeDebug;
    }

    _debug.horizonResults.push(horizonDebug);
    putSpreads.push(putRow);
    callSpreads.push(callRow);
  }

  return { putSpreads, callSpreads, spreadWidth: SPREAD_WIDTH, _debug };
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
 * Debug version of findBestSpread - returns info about why it failed.
 */
function debugFindBestSpread(contracts, sortedStrikes, boundary, type, spreadWidth) {
  const info = { boundary, type, spreadWidth, strikesAvailable: sortedStrikes.length };

  if (sortedStrikes.length === 0) {
    info.reason = 'No strikes available';
    return info;
  }

  let sellStrike = null;
  if (type === 'put') {
    for (let i = sortedStrikes.length - 1; i >= 0; i--) {
      if (sortedStrikes[i] <= boundary) { sellStrike = sortedStrikes[i]; break; }
    }
    if (sellStrike === null) sellStrike = sortedStrikes[0];
  } else {
    for (let i = 0; i < sortedStrikes.length; i++) {
      if (sortedStrikes[i] >= boundary) { sellStrike = sortedStrikes[i]; break; }
    }
    if (sellStrike === null) sellStrike = sortedStrikes[sortedStrikes.length - 1];
  }
  info.sellStrike = sellStrike;

  const buyTarget = type === 'put' ? sellStrike - spreadWidth : sellStrike + spreadWidth;
  let buyStrike = null;
  let buyDist = Infinity;
  for (const s of sortedStrikes) {
    const dist = Math.abs(s - buyTarget);
    if (dist < buyDist) { buyDist = dist; buyStrike = s; }
  }
  info.buyTarget = buyTarget;
  info.buyStrike = buyStrike;
  info.buyDist = buyDist;

  if (buyStrike === null || buyStrike === sellStrike) {
    info.reason = buyStrike === null ? 'No buy strike found' : 'Buy strike equals sell strike';
    return info;
  }

  const sellContract = contracts[sellStrike];
  const buyContract = contracts[buyStrike];
  if (!sellContract || !buyContract) {
    info.reason = !sellContract ? 'No sell contract found' : 'No buy contract found';
    return info;
  }

  // Check prices
  info.sellPrice = extractPriceDebug(sellContract);
  info.buyPrice = extractPriceDebug(buyContract);

  const sellMid = extractPrice(sellContract);
  const buyMid = extractPrice(buyContract);
  info.sellMid = sellMid;
  info.buyMid = buyMid;

  if (sellMid <= 0 || buyMid <= 0) {
    info.reason = `Price missing: sellMid=${sellMid}, buyMid=${buyMid}`;
    return info;
  }

  info.reason = 'Unknown - should have succeeded';
  return info;
}

/**
 * Debug price extraction - shows all available price sources.
 */
function extractPriceDebug(contract) {
  return {
    midpoint: contract.last_quote?.midpoint ?? null,
    bid: contract.last_quote?.bid ?? null,
    ask: contract.last_quote?.ask ?? null,
    fmv: contract.fair_market_value ?? null,
    lastTrade: contract.last_trade?.price ?? null,
  };
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

  // Both prices must be available for a meaningful spread
  if (sellMid <= 0 || buyMid <= 0) return null;

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
