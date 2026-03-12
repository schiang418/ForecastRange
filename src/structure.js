/**
 * Support/Resistance structure computation from daily OHLCV bars.
 *
 * Identifies key price levels using:
 *   - Swing highs/lows (local extrema)
 *   - Recent N-bar highs and lows
 *
 * Returns nearest support and resistance levels relative to spot.
 */

/**
 * Find swing highs: bars where high > max(high of N bars before and N bars after).
 * Returns array of { date, price, index }.
 */
function findSwingHighs(bars, lookback = 3) {
  const results = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const high = bars[i].h;
    let isSwingHigh = true;
    for (let j = 1; j <= lookback; j++) {
      if (bars[i - j].h >= high || bars[i + j].h >= high) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) {
      results.push({ date: bars[i].date, price: high, index: i });
    }
  }
  return results;
}

/**
 * Find swing lows: bars where low < min(low of N bars before and N bars after).
 * Returns array of { date, price, index }.
 */
function findSwingLows(bars, lookback = 3) {
  const results = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const low = bars[i].l;
    let isSwingLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (bars[i - j].l <= low || bars[i + j].l <= low) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) {
      results.push({ date: bars[i].date, price: low, index: i });
    }
  }
  return results;
}

/**
 * Compute support and resistance levels for a given horizon.
 *
 * @param {Array} bars - OHLCV bars sorted ascending
 * @param {number} spot - Current price
 * @param {number} lookbackDays - Number of bars to look back (scales with horizon)
 * @returns {{ support, resistance, distToSupport, distToResistance, structureMove, levels }}
 */
function computeSupportResistance(bars, spot, lookbackDays = 30) {
  if (!bars || bars.length < 20) {
    return { support: null, resistance: null, distToSupport: null, distToResistance: null, structureMove: 0, levels: [] };
  }

  const recentBars = bars.slice(-Math.min(lookbackDays, bars.length));

  // Find swing highs/lows
  const swingHighs = findSwingHighs(recentBars, 3);
  const swingLows = findSwingLows(recentBars, 3);

  // Also add recent N-bar high and low as broader levels
  const recentHigh = Math.max(...recentBars.map(b => b.h));
  const recentLow = Math.min(...recentBars.map(b => b.l));

  // Collect all resistance candidates (above spot)
  const resistanceLevels = [
    ...swingHighs.filter(s => s.price > spot).map(s => ({ price: s.price, type: 'swing_high', date: s.date })),
  ];
  if (recentHigh > spot) {
    resistanceLevels.push({ price: recentHigh, type: 'recent_high', date: null });
  }

  // Collect all support candidates (below spot)
  const supportLevels = [
    ...swingLows.filter(s => s.price < spot).map(s => ({ price: s.price, type: 'swing_low', date: s.date })),
  ];
  if (recentLow < spot) {
    supportLevels.push({ price: recentLow, type: 'recent_low', date: null });
  }

  // Find nearest resistance (closest above spot)
  resistanceLevels.sort((a, b) => a.price - b.price);
  const resistance = resistanceLevels.length > 0 ? resistanceLevels[0] : null;

  // Find nearest support (closest below spot)
  supportLevels.sort((a, b) => b.price - a.price);
  const support = supportLevels.length > 0 ? supportLevels[0] : null;

  const distToResistance = resistance ? resistance.price - spot : null;
  const distToSupport = support ? spot - support.price : null;

  // Structure move: average distance to nearest S/R levels
  // This represents the expected range implied by price structure
  let structureMove = 0;
  if (distToResistance != null && distToSupport != null) {
    structureMove = (distToResistance + distToSupport) / 2;
  } else if (distToResistance != null) {
    structureMove = distToResistance;
  } else if (distToSupport != null) {
    structureMove = distToSupport;
  }

  // Collect all levels for audit
  const allLevels = [
    ...resistanceLevels.slice(0, 3).map(l => ({ ...l, side: 'resistance' })),
    ...supportLevels.slice(0, 3).map(l => ({ ...l, side: 'support' })),
  ];

  return {
    support: support ? { price: support.price, type: support.type, date: support.date } : null,
    resistance: resistance ? { price: resistance.price, type: resistance.type, date: resistance.date } : null,
    distToSupport: distToSupport != null ? Math.round(distToSupport * 100) / 100 : null,
    distToResistance: distToResistance != null ? Math.round(distToResistance * 100) / 100 : null,
    structureMove: Math.round(structureMove * 100) / 100,
    levels: allLevels,
  };
}

// Lookback days per horizon week for S/R computation
const SR_LOOKBACK = {
  1: 20,
  2: 30,
  3: 45,
  4: 60,
};

module.exports = { computeSupportResistance, findSwingHighs, findSwingLows, SR_LOOKBACK };
