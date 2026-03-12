/**
 * Core forecast computation module.
 *
 * Accepts raw OHLCV bars and optional options chain data.
 * Computes IV-based, ATR-based, and RV-based forecast components.
 * Blends components with automatic fallback when IV is unavailable.
 * Returns structured forecast result for 1-4 week horizons.
 *
 * v2: Added ATM straddle expected move, IV term structure interpolation,
 *     and support/resistance structure term.
 */

const { computeForecastIndicators } = require('./indicators');
const { extractAtmIV, extractAtmStraddle } = require('./polygon');
const { gradientScore } = require('./scoring');
const { computeSupportResistance, SR_LOOKBACK } = require('./structure');

/**
 * Compute Friday-aligned horizons.
 * Returns an array of { weeks, tradingDays, targetDate } for the next 4 Fridays.
 * If today is already Friday, the first target is NEXT Friday (not today).
 */
function computeFridayHorizons(today) {
  const results = [];
  // Find the next Friday from today
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  let daysUntilFriday;
  if (dayOfWeek === 5) {
    daysUntilFriday = 7; // If Friday, target next Friday
  } else if (dayOfWeek === 6) {
    daysUntilFriday = 6; // Saturday -> next Friday
  } else {
    daysUntilFriday = 5 - dayOfWeek; // Sun(0)->5, Mon(1)->4, Tue(2)->3, Wed(3)->2, Thu(4)->1
  }
  // Sunday is non-trading, so adjust: Sun->5 trading days to Fri, but calendar is 5 days
  // Trading days = calendar weekdays between today (exclusive) and target Friday (inclusive)
  for (let i = 0; i < 4; i++) {
    const calendarDays = daysUntilFriday + i * 7;
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + calendarDays);

    // Count trading days from today to targetDate (both exclusive of weekends)
    let tradingDays = 0;
    const cursor = new Date(today);
    for (let d = 1; d <= calendarDays; d++) {
      cursor.setDate(today.getDate() + d);
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) tradingDays++;
    }

    results.push({
      weeks: i + 1,
      tradingDays,
      targetDate: targetDate.toISOString().slice(0, 10),
    });
  }
  return results;
}

// Blending weights by horizon (weeks) when IV/straddle is available
// [options_weight, atr_weight, rv_weight, structure_weight]
const BLEND_WEIGHTS_WITH_IV = {
  1: [0.55, 0.25, 0.15, 0.05],
  2: [0.50, 0.25, 0.15, 0.10],
  3: [0.45, 0.25, 0.15, 0.15],
  4: [0.40, 0.25, 0.15, 0.20],
};

// Blending weights when IV is unavailable
const BLEND_WEIGHTS_FALLBACK = { atr: 0.55, rv: 0.45 };

// Trend drift calibration constant
const TREND_DRIFT_K = 0.02;

// Sigma multipliers for probability bands
const SIGMA_50 = 0.67;   // ~50% confidence
const SIGMA_68 = 1.00;   // ~68% confidence
const SIGMA_90 = 1.80;   // ~90% confidence (fat-tail adjusted from 1.64)

/**
 * Compute the trend drift score from indicators.
 * Weighted combination of EMA slopes, MACD histogram, and RSI regime.
 * Returns a value in [-1, +1] range.
 */
function computeTrendScore(indicators) {
  const { ema20Slope, ema50Slope, macd: macdResult, rsi14 } = indicators;

  // Normalize EMA20 slope to [-1, +1]
  // Typical EMA20 slope over 10 bars: -5% to +5%
  const normEma20 = ema20Slope != null
    ? gradientScore(ema20Slope * 100, [[-5, -1], [0, 0], [5, 1]])
    : 0;

  // Normalize EMA50 slope to [-1, +1]
  const normEma50 = ema50Slope != null
    ? gradientScore(ema50Slope * 100, [[-3, -1], [0, 0], [3, 1]])
    : 0;

  // Normalize MACD histogram to [-1, +1]
  // Scale relative to price: histogram / close * 100
  const normMacd = macdResult != null && indicators.close > 0
    ? gradientScore((macdResult.histogram / indicators.close) * 100, [[-1, -1], [0, 0], [1, 1]])
    : 0;

  // Normalize RSI to [-1, +1] regime
  // RSI < 30 = oversold (bearish momentum), RSI > 70 = overbought (bullish momentum)
  // Center at 50 = neutral
  const normRsi = rsi14 != null
    ? gradientScore(rsi14, [[20, -1], [30, -0.5], [50, 0], [70, 0.5], [80, 1]])
    : 0;

  // Weighted combination
  const score = 0.35 * normEma20 + 0.25 * normEma50 + 0.20 * normMacd + 0.20 * normRsi;

  return {
    score,
    components: {
      ema20Slope: { raw: ema20Slope != null ? ema20Slope * 100 : null, normalized: round4(normEma20), weight: 0.35 },
      ema50Slope: { raw: ema50Slope != null ? ema50Slope * 100 : null, normalized: round4(normEma50), weight: 0.25 },
      macdHistogram: { raw: macdResult ? (macdResult.histogram / indicators.close) * 100 : null, normalized: round4(normMacd), weight: 0.20 },
      rsiRegime: { raw: rsi14, normalized: round4(normRsi), weight: 0.20 },
    },
  };
}

/**
 * Get the interpolated IV for a specific horizon from expiration IV data.
 * horizonDays: trading days (5, 10, 15, 20 for 1-4 weeks)
 * expirationIVs: array of { expirationDate, iv } sorted by date
 * today: Date object for current date
 *
 * Returns { iv, interpolated, beforeExp, afterExp, t } for auditability.
 */
function getIVForHorizon(expirationIVs, horizonDays, today) {
  if (!expirationIVs || expirationIVs.length === 0) return null;

  // Target calendar date (approximate: trading days * 1.4 for calendar days)
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + Math.round(horizonDays * 1.4));
  const targetStr = targetDate.toISOString().slice(0, 10);

  // Find the two expirations that bracket the target
  let before = null;
  let after = null;

  for (const item of expirationIVs) {
    if (item.expirationDate <= targetStr) {
      before = item;
    }
    if (item.expirationDate >= targetStr && !after) {
      after = item;
    }
  }

  // If exact match or only one side available
  if (before && after && before.expirationDate === after.expirationDate) {
    return { iv: before.iv, interpolated: false, beforeExp: before.expirationDate, afterExp: before.expirationDate, t: 0 };
  }
  if (!before) return after ? { iv: after.iv, interpolated: false, beforeExp: null, afterExp: after.expirationDate, t: 0 } : null;
  if (!after) return { iv: before.iv, interpolated: false, beforeExp: before.expirationDate, afterExp: null, t: 0 };

  // Linear interpolation between the two bracketing expirations
  const beforeDate = new Date(before.expirationDate);
  const afterDate = new Date(after.expirationDate);
  const totalDays = (afterDate - beforeDate) / (1000 * 60 * 60 * 24);
  const elapsedDays = (targetDate - beforeDate) / (1000 * 60 * 60 * 24);

  if (totalDays <= 0) return { iv: before.iv, interpolated: false, beforeExp: before.expirationDate, afterExp: after.expirationDate, t: 0 };
  const t = Math.max(0, Math.min(1, elapsedDays / totalDays));
  const iv = before.iv + t * (after.iv - before.iv);
  return {
    iv,
    interpolated: true,
    beforeExp: before.expirationDate,
    afterExp: after.expirationDate,
    beforeIV: before.iv,
    afterIV: after.iv,
    t: round4(t),
  };
}

/**
 * Get the interpolated straddle expected move for a specific horizon.
 * Similar to getIVForHorizon but works with straddle data.
 *
 * Since straddle prices are for specific expiration dates, we need to
 * sqrt-scale between expirations when interpolating.
 */
function getStraddleMoveForHorizon(straddleData, horizonDays, today) {
  if (!straddleData || straddleData.length === 0) return null;

  // Target calendar date
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + Math.round(horizonDays * 1.4));
  const targetStr = targetDate.toISOString().slice(0, 10);

  // Find bracketing expirations
  let before = null;
  let after = null;

  for (const item of straddleData) {
    if (item.expirationDate <= targetStr) before = item;
    if (item.expirationDate >= targetStr && !after) after = item;
  }

  // Exact match
  if (before && after && before.expirationDate === after.expirationDate) {
    return { move: before.expectedMove, source: 'straddle_exact', expiration: before.expirationDate, straddle: before };
  }

  // Only one side available: scale the straddle move by sqrt ratio of time
  if (!before && after) {
    const afterDays = calendarDaysBetween(today, new Date(after.expirationDate));
    const targetDays = calendarDaysBetween(today, targetDate);
    if (afterDays > 0) {
      const scaled = after.expectedMove * Math.sqrt(targetDays / afterDays);
      return { move: round2(scaled), source: 'straddle_scaled', expiration: after.expirationDate, straddle: after, scaleFactor: round4(Math.sqrt(targetDays / afterDays)) };
    }
    return { move: after.expectedMove, source: 'straddle_nearest', expiration: after.expirationDate, straddle: after };
  }
  if (!after && before) {
    const beforeDays = calendarDaysBetween(today, new Date(before.expirationDate));
    const targetDays = calendarDaysBetween(today, targetDate);
    if (beforeDays > 0) {
      const scaled = before.expectedMove * Math.sqrt(targetDays / beforeDays);
      return { move: round2(scaled), source: 'straddle_scaled', expiration: before.expirationDate, straddle: before, scaleFactor: round4(Math.sqrt(targetDays / beforeDays)) };
    }
    return { move: before.expectedMove, source: 'straddle_nearest', expiration: before.expirationDate, straddle: before };
  }

  // Interpolate between bracketing expirations using sqrt-time scaling
  const beforeDays = calendarDaysBetween(today, new Date(before.expirationDate));
  const afterDays = calendarDaysBetween(today, new Date(after.expirationDate));
  const targetDays = calendarDaysBetween(today, targetDate);
  const totalRange = afterDays - beforeDays;

  if (totalRange <= 0) return { move: before.expectedMove, source: 'straddle_exact', expiration: before.expirationDate, straddle: before };

  const t = (targetDays - beforeDays) / totalRange;
  const interpolatedMove = before.expectedMove + t * (after.expectedMove - before.expectedMove);

  return {
    move: round2(interpolatedMove),
    source: 'straddle_interpolated',
    beforeExp: before.expirationDate,
    afterExp: after.expirationDate,
    t: round4(t),
    straddle: before,
  };
}

function calendarDaysBetween(d1, d2) {
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

/**
 * Compute basic confidence score.
 */
function computeConfidence(atrMove, rvMove, ivMove, trendScore) {
  // Vol agreement: how much ATR and RV agree (0 to 1)
  const maxVol = Math.max(atrMove, rvMove);
  const volAgreement = maxVol > 0 ? 1 - Math.abs(atrMove - rvMove) / maxVol : 0.5;

  // Trend clarity: how decisive the trend is (0 to 1)
  const trendClarity = Math.abs(trendScore);

  if (ivMove != null) {
    // IV agreement: how much IV agrees with ATR/RV average
    const avgMove = (atrMove + rvMove) / 2;
    const maxVal = Math.max(ivMove, avgMove);
    const ivAgreement = maxVal > 0 ? 1 - Math.abs(ivMove - avgMove) / maxVal : 0.5;

    const score = 0.35 * volAgreement + 0.30 * ivAgreement + 0.35 * trendClarity;
    return {
      score,
      components: {
        volAgreement: { value: round4(volAgreement), weight: 0.35 },
        ivAgreement: { value: round4(ivAgreement), weight: 0.30 },
        trendClarity: { value: round4(trendClarity), weight: 0.35 },
      },
    };
  }

  const score = 0.50 * volAgreement + 0.50 * trendClarity;
  return {
    score,
    components: {
      volAgreement: { value: round4(volAgreement), weight: 0.50 },
      trendClarity: { value: round4(trendClarity), weight: 0.50 },
    },
  };
}

/**
 * Map confidence score to label.
 */
function confidenceLabel(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.60) return 'medium-high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

/**
 * Determine skew label from trend drift relative to spot.
 */
function skewLabel(drift, spot) {
  const pct = Math.abs(drift / spot) * 100;
  if (pct < 0.2) return 'neutral';
  if (drift > 0) return pct < 0.5 ? 'slight bullish' : 'bullish';
  return pct < 0.5 ? 'slight bearish' : 'bearish';
}

/**
 * Main forecast function.
 *
 * @param {Array} bars - OHLCV bars sorted ascending
 * @param {Array|null} optionsChain - Options chain snapshot from Polygon.io (or null)
 * @param {Object} options - { horizons: [1,2,3,4] }
 * @returns {Object} Full forecast result
 */
function computeForecast(bars, optionsChain = null, options = {}) {
  const horizons = options.horizons || [1, 2, 3, 4];

  // Compute indicators
  const indicators = computeForecastIndicators(bars);
  if (indicators.error) {
    return { error: indicators.error };
  }

  const spot = indicators.close;
  const { atr14, rv20 } = indicators;

  if (atr14 == null || rv20 == null) {
    return { error: 'Could not compute ATR or realized volatility' };
  }

  // Extract IV from options chain (for term structure)
  const expirationIVs = optionsChain ? extractAtmIV(optionsChain, spot) : null;
  const ivAvailable = expirationIVs != null && expirationIVs.length > 0;

  // Extract ATM straddle expected move from options chain
  const straddleData = optionsChain ? extractAtmStraddle(optionsChain, spot) : null;
  const straddleAvailable = straddleData != null && straddleData.length > 0;

  // Compute trend score
  const trendResult = computeTrendScore(indicators);
  const trendScore = trendResult.score;

  // Compute Friday-aligned horizons
  const today = new Date();
  const fridayHorizons = computeFridayHorizons(today);

  const forecastHorizons = horizons.map(weeks => {
    const fridayInfo = fridayHorizons.find(f => f.weeks === weeks);
    const h = fridayInfo ? fridayInfo.tradingDays : weeks * 5; // trading days
    const targetDate = fridayInfo ? fridayInfo.targetDate : null;

    // ATR-based move
    const atrMove = atr14 * Math.sqrt(h);

    // RV-based move: rv20 is daily sigma, scale by sqrt(h) then multiply by spot
    const rvMove = spot * rv20 * Math.sqrt(h);

    // IV-based move (with term structure interpolation)
    let ivMove = null;
    let horizonIV = null;
    let ivTermStructure = null;
    if (ivAvailable) {
      const ivResult = getIVForHorizon(expirationIVs, h, today);
      if (ivResult != null) {
        horizonIV = ivResult.iv;
        ivMove = spot * horizonIV * Math.sqrt(h / 252);
        ivTermStructure = {
          interpolated: ivResult.interpolated,
          beforeExp: ivResult.beforeExp,
          afterExp: ivResult.afterExp,
          beforeIV: ivResult.beforeIV != null ? round4(ivResult.beforeIV) : null,
          afterIV: ivResult.afterIV != null ? round4(ivResult.afterIV) : null,
          t: ivResult.t,
        };
      }
    }

    // Straddle expected move (market-implied, replaces IV when available)
    let straddleMove = null;
    let straddleInfo = null;
    if (straddleAvailable) {
      const straddleResult = getStraddleMoveForHorizon(straddleData, h, today);
      if (straddleResult != null) {
        straddleMove = straddleResult.move;
        straddleInfo = {
          source: straddleResult.source,
          expiration: straddleResult.expiration || straddleResult.beforeExp,
          move: straddleResult.move,
          straddle: straddleResult.straddle,
          scaleFactor: straddleResult.scaleFactor || null,
          t: straddleResult.t || null,
        };
      }
    }

    // The primary options-derived move: prefer straddle over IV
    const optionsMove = straddleMove != null ? straddleMove : ivMove;
    const optionsSource = straddleMove != null ? 'straddle' : (ivMove != null ? 'iv' : null);

    // S/R structure term
    const lookback = SR_LOOKBACK[weeks] || 60;
    const srResult = computeSupportResistance(bars, spot, lookback);
    const structureMove = srResult.structureMove;

    // Blended move with detailed weight breakdown
    let blendedMove;
    let blendWeights;
    let blendContributions;
    if (optionsMove != null) {
      const [wOpt, wATR, wRV, wStruct] = BLEND_WEIGHTS_WITH_IV[weeks] || BLEND_WEIGHTS_WITH_IV[4];
      blendedMove = wOpt * optionsMove + wATR * atrMove + wRV * rvMove + wStruct * structureMove;
      blendWeights = { options: wOpt, atr: wATR, rv: wRV, structure: wStruct };
      blendContributions = {
        options: round2(wOpt * optionsMove),
        atr: round2(wATR * atrMove),
        rv: round2(wRV * rvMove),
        structure: round2(wStruct * structureMove),
      };
    } else {
      blendedMove = BLEND_WEIGHTS_FALLBACK.atr * atrMove + BLEND_WEIGHTS_FALLBACK.rv * rvMove;
      blendWeights = { atr: BLEND_WEIGHTS_FALLBACK.atr, rv: BLEND_WEIGHTS_FALLBACK.rv };
      blendContributions = {
        atr: round2(BLEND_WEIGHTS_FALLBACK.atr * atrMove),
        rv: round2(BLEND_WEIGHTS_FALLBACK.rv * rvMove),
      };
    }

    // Trend drift
    const trendDrift = spot * TREND_DRIFT_K * trendScore * Math.sqrt(h / 5);

    // Center and bands
    const center = spot + trendDrift;
    const range50 = { low: center - SIGMA_50 * blendedMove, high: center + SIGMA_50 * blendedMove };
    const range68 = { low: center - SIGMA_68 * blendedMove, high: center + SIGMA_68 * blendedMove };
    const range90 = { low: center - SIGMA_90 * blendedMove, high: center + SIGMA_90 * blendedMove };

    // Confidence with sub-components (use optionsMove for IV agreement check)
    const confidenceResult = computeConfidence(atrMove, rvMove, optionsMove, trendScore);

    // Expected move as percentage
    const expectedMovePct = (blendedMove / spot) * 100;

    return {
      horizon: `${weeks}W`,
      horizonWeeks: weeks,
      horizonDays: h,
      targetDate,
      center: round2(center),
      expectedMove: round2(blendedMove),
      expectedMovePct: round2(expectedMovePct),
      range50: { low: round2(range50.low), high: round2(range50.high) },
      range68: { low: round2(range68.low), high: round2(range68.high) },
      range90: { low: round2(range90.low), high: round2(range90.high) },
      skew: skewLabel(trendDrift, spot),
      trendDrift: round2(trendDrift),
      confidence: round2(confidenceResult.score),
      confidenceLabel: confidenceLabel(confidenceResult.score),
      ivAvailable: optionsMove != null,
      ivUsed: horizonIV != null ? round4(horizonIV) : null,
      optionsSource,
      components: {
        atrMove: round2(atrMove),
        rvMove: round2(rvMove),
        ivMove: ivMove != null ? round2(ivMove) : null,
        straddleMove: straddleMove != null ? round2(straddleMove) : null,
        structureMove: round2(structureMove),
      },
      blending: {
        weights: blendWeights,
        contributions: blendContributions,
        formula: optionsMove != null
          ? `${blendWeights.options}*${optionsSource === 'straddle' ? 'STRADDLE' : 'IV'} + ${blendWeights.atr}*ATR + ${blendWeights.rv}*RV + ${blendWeights.structure}*S/R`
          : `${blendWeights.atr}*ATR + ${blendWeights.rv}*RV`,
      },
      confidenceBreakdown: confidenceResult.components,
      trendDriftCalc: {
        formula: `spot * k * trendScore * sqrt(h/5)`,
        values: { spot: round2(spot), k: TREND_DRIFT_K, trendScore: round4(trendScore), sqrtFactor: round4(Math.sqrt(h / 5)) },
        result: round2(trendDrift),
      },
      bandCalc: {
        sigmaMultipliers: { band50: SIGMA_50, band68: SIGMA_68, band90: SIGMA_90 },
        moveUsed: round2(blendedMove),
        centerUsed: round2(center),
      },
      straddleInfo: straddleInfo ? {
        source: straddleInfo.source,
        expiration: straddleInfo.expiration,
        move: straddleInfo.move,
        callMid: straddleInfo.straddle?.callMid,
        putMid: straddleInfo.straddle?.putMid,
        straddle: straddleInfo.straddle?.straddle,
        strike: straddleInfo.straddle?.strike,
        scaleFactor: straddleInfo.scaleFactor,
        t: straddleInfo.t,
      } : null,
      ivTermStructure: ivTermStructure,
      structureData: {
        support: srResult.support,
        resistance: srResult.resistance,
        distToSupport: srResult.distToSupport,
        distToResistance: srResult.distToResistance,
        structureMove: srResult.structureMove,
        lookbackDays: lookback,
        levels: srResult.levels,
      },
    };
  });

  return {
    ticker: bars[bars.length - 1]?.ticker || options.ticker || 'UNKNOWN',
    spot: round2(spot),
    generatedAt: new Date().toISOString(),
    dataPoints: bars.length,
    ivAvailable,
    ivExpirations: expirationIVs ? expirationIVs.length : 0,
    straddleAvailable,
    straddleExpirations: straddleData ? straddleData.length : 0,
    trendScore: round4(trendScore),
    trendBreakdown: trendResult.components,
    indicators: {
      ema20: round2(indicators.ema20),
      sma50: round2(indicators.sma50),
      rsi14: round2(indicators.rsi14),
      atr14: round2(indicators.atr14),
      rv20Daily: round4(rv20),
      ema20Slope: indicators.ema20Slope != null ? round4(indicators.ema20Slope) : null,
      ema50Slope: indicators.ema50Slope != null ? round4(indicators.ema50Slope) : null,
      macdHistogram: indicators.macd ? round4(indicators.macd.histogram) : null,
      bollingerBandwidth: indicators.bollingerBands ? round4(indicators.bollingerBands.bandwidth) : null,
    },
    ivTermStructure: expirationIVs ? expirationIVs.map(e => ({
      expirationDate: e.expirationDate,
      iv: round4(e.iv),
      contractsUsed: e.contractsUsed,
    })) : null,
    straddleTermStructure: straddleData ? straddleData.map(s => ({
      expirationDate: s.expirationDate,
      strike: s.strike,
      callMid: s.callMid,
      putMid: s.putMid,
      straddle: s.straddle,
      expectedMove: s.expectedMove,
    })) : null,
    horizons: forecastHorizons,
  };
}

function round2(v) {
  return v != null ? Math.round(v * 100) / 100 : null;
}

function round4(v) {
  return v != null ? Math.round(v * 10000) / 10000 : null;
}

module.exports = { computeForecast, computeTrendScore };
