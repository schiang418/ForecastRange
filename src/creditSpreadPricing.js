const SPREAD_WIDTH = 50; // $50 spread width
const RATE_LIMIT_DELAY = 200; // ms between individual contract fetches

/**
 * Compute credit spread pricing for all horizons.
 * Uses bulk chain data for strike discovery, then fetches individual
 * contract snapshots for pricing (since bulk endpoint often lacks quotes for OTM).
 *
 * @param {Array} optionsChain - Full options chain from Polygon snapshot
 * @param {Array} horizons - Computed forecast horizons with range data
 * @param {number} spot - Current spot price
 * @param {string} ticker - Underlying ticker symbol
 * @param {Function} getOptionSnapshot - Function to fetch individual contract snapshot
 * @param {Function} buildOptionTicker - Function to build OCC option ticker
 * @returns {{ putSpreads, callSpreads, spreadWidth, _debug }}
 */
async function computeCreditSpreadPricing(optionsChain, horizons, spot, ticker, getOptionSnapshot, buildOptionTicker) {
  const _debug = {
    totalContracts: optionsChain ? optionsChain.length : 0,
    indexedContracts: 0,
    pricingMethod: 'individual_snapshot',
    fetchedPrices: 0,
    fetchErrors: 0,
    expirations: [],
    horizonResults: [],
  };

  if (!optionsChain || optionsChain.length === 0) {
    _debug.error = 'No options chain data';
    return { putSpreads: [], callSpreads: [], spreadWidth: SPREAD_WIDTH, _debug };
  }

  // Index contracts by expiration → type → strike for strike discovery
  const contractIndex = {};
  for (const c of optionsChain) {
    const exp = c.details?.expiration_date;
    const type = c.details?.contract_type;
    const strike = c.details?.strike_price;
    if (!exp || !type || strike == null) continue;

    if (!contractIndex[exp]) contractIndex[exp] = { call: {}, put: {} };
    if (!contractIndex[exp][type]) contractIndex[exp][type] = {};
    contractIndex[exp][type][strike] = c;
    _debug.indexedContracts++;
  }

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

  // Cache fetched prices to avoid duplicate API calls
  const priceCache = {};

  async function fetchPrice(expiration, strike, type) {
    const putCall = type === 'put' ? 'P' : 'C';
    const cacheKey = `${expiration}_${putCall}_${strike}`;
    if (priceCache[cacheKey] !== undefined) return priceCache[cacheKey];

    const optionTicker = buildOptionTicker(ticker, expiration, putCall, strike);
    try {
      await sleep(RATE_LIMIT_DELAY);
      const snap = await getOptionSnapshot(ticker, optionTicker);
      _debug.fetchedPrices++;
      if (snap && snap.midpoint > 0) {
        priceCache[cacheKey] = snap;
        return snap;
      }
      // Log first few failures for debugging
      if (_debug.fetchedPrices <= 3) {
        _debug[`fetch_${cacheKey}`] = { optionTicker, snap };
      }
      priceCache[cacheKey] = null;
      return null;
    } catch (err) {
      _debug.fetchErrors++;
      if (_debug.fetchErrors <= 3) {
        _debug[`fetchErr_${_debug.fetchErrors}`] = { optionTicker, error: err.message };
      }
      priceCache[cacheKey] = null;
      return null;
    }
  }

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
      horizonDebug.error = !bestExp ? 'No matching expiration' : 'No contracts for exp';
      _debug.horizonResults.push(horizonDebug);
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

      const rangeDebug = { low: range.low, high: range.high };

      // PUT CREDIT SPREAD: sell put at/below range low, buy put ~$50 lower
      const putStrikePair = findStrikePair(putStrikes, range.low, 'put', SPREAD_WIDTH);
      if (putStrikePair) {
        const result = await priceSingleSpread(
          putStrikePair.sellStrike, putStrikePair.buyStrike,
          bestExp, 'put', puts, fetchPrice
        );
        if (result) {
          putRow.ranges[rangeName] = result;
          rangeDebug.putResult = 'OK';
        } else {
          rangeDebug.putDebug = { ...putStrikePair, reason: 'Price fetch failed' };
        }
      } else {
        rangeDebug.putDebug = { reason: 'No valid strike pair found' };
      }

      // CALL CREDIT SPREAD: sell call at/above range high, buy call ~$50 higher
      const callStrikePair = findStrikePair(callStrikes, range.high, 'call', SPREAD_WIDTH);
      if (callStrikePair) {
        const result = await priceSingleSpread(
          callStrikePair.sellStrike, callStrikePair.buyStrike,
          bestExp, 'call', calls, fetchPrice
        );
        if (result) {
          callRow.ranges[rangeName] = result;
          rangeDebug.callResult = 'OK';
        } else {
          rangeDebug.callDebug = { ...callStrikePair, reason: 'Price fetch failed' };
        }
      } else {
        rangeDebug.callDebug = { reason: 'No valid strike pair found' };
      }

      horizonDebug.ranges[rangeName] = rangeDebug;
    }

    _debug.horizonResults.push(horizonDebug);
    putSpreads.push(putRow);
    callSpreads.push(callRow);
  }

  return { putSpreads, callSpreads, spreadWidth: SPREAD_WIDTH, _debug };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
    if (dist < bestDist && dist <= 7 * 24 * 60 * 60 * 1000) {
      bestDist = dist;
      best = exp;
    }
  }

  return best;
}

/**
 * Find sell/buy strike pair for a spread.
 * Returns { sellStrike, buyStrike } or null.
 */
function findStrikePair(sortedStrikes, boundary, type, spreadWidth) {
  if (sortedStrikes.length === 0) return null;

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

  const buyTarget = type === 'put' ? sellStrike - spreadWidth : sellStrike + spreadWidth;
  let buyStrike = null;
  let buyDist = Infinity;

  for (const s of sortedStrikes) {
    const dist = Math.abs(s - buyTarget);
    if (dist < buyDist) { buyDist = dist; buyStrike = s; }
  }

  if (buyStrike === null || buyStrike === sellStrike) return null;

  return { sellStrike, buyStrike };
}

/**
 * Price a single spread by fetching individual contract snapshots.
 * First tries bulk data, falls back to individual API calls.
 */
async function priceSingleSpread(sellStrike, buyStrike, expiration, type, bulkContracts, fetchPrice) {
  // Try bulk data first
  let sellMid = extractPrice(bulkContracts[sellStrike]);
  let buyMid = extractPrice(bulkContracts[buyStrike]);
  let sellIV = bulkContracts[sellStrike]?.implied_volatility ?? null;
  let buyIV = bulkContracts[buyStrike]?.implied_volatility ?? null;

  // If bulk data lacks prices, fetch individually
  if (sellMid <= 0) {
    const snap = await fetchPrice(expiration, sellStrike, type);
    if (snap) {
      sellMid = snap.midpoint;
      sellIV = snap.iv;
    }
  }
  if (buyMid <= 0) {
    const snap = await fetchPrice(expiration, buyStrike, type);
    if (snap) {
      buyMid = snap.midpoint;
      buyIV = snap.iv;
    }
  }

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
    sellIV,
    buyIV,
  };
}

/**
 * Extract the best available price from a bulk contract snapshot.
 */
function extractPrice(contract) {
  if (!contract) return 0;

  const mid = contract.last_quote?.midpoint;
  if (mid && mid > 0) return mid;

  const bid = contract.last_quote?.bid ?? 0;
  const ask = contract.last_quote?.ask ?? 0;
  if (bid > 0 && ask > 0) return (bid + ask) / 2;
  if (ask > 0) return ask / 2;

  if (contract.fair_market_value && contract.fair_market_value > 0) {
    return contract.fair_market_value;
  }

  if (contract.last_trade?.price && contract.last_trade.price > 0) {
    return contract.last_trade.price;
  }

  return 0;
}

module.exports = { computeCreditSpreadPricing };
