/**
 * Volatility metrics and premium quality scoring.
 *
 * Computes IV/RV ratio, RV percentile, and premium quality score
 * from daily OHLCV bars and current options-derived IV.
 *
 * Uses rolling realized volatility history as the baseline distribution,
 * since historical IV requires storing daily snapshots over time.
 */

/**
 * Compute rolling realized volatility (daily sigma) for each day in the bar history.
 * Returns array of { date, rv } where rv is the daily sigma (not annualized).
 * First `window` entries will be null.
 */
function computeRollingRV(bars, window = 20) {
  if (!bars || bars.length < window + 1) return [];

  const closes = bars.map(b => b.c);
  const results = [];

  for (let end = window; end < closes.length; end++) {
    // Compute log returns for [end-window, end]
    const logReturns = [];
    for (let i = end - window + 1; i <= end; i++) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
    const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
    const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
    const dailySigma = Math.sqrt(variance);

    results.push({
      date: bars[end].date,
      rv: dailySigma,
      rvAnnualized: dailySigma * Math.sqrt(252),
    });
  }

  return results;
}

/**
 * Compute volatility and premium quality metrics.
 *
 * @param {number|null} currentIV - Current interpolated IV (annualized, decimal e.g. 1.218 for 121.8%)
 * @param {number} rv20Daily - Current 20-day realized vol (daily sigma, not annualized)
 * @param {Array} bars - OHLCV bars for computing RV history
 * @returns {Object} Volatility metrics panel data
 */
function computeVolatilityMetrics(currentIV, rv20Daily, bars) {
  const rv20Annualized = rv20Daily * Math.sqrt(252);

  // Compute rolling RV history for percentile calculations
  const rvHistory = computeRollingRV(bars, 20);

  // --- RV Percentile (252d lookback, use what we have) ---
  // What % of historical RV values are below current RV
  let rvPercentile = null;
  if (rvHistory.length >= 20) {
    const annualizedValues = rvHistory.map(r => r.rvAnnualized);
    const belowCount = annualizedValues.filter(v => v < rv20Annualized).length;
    rvPercentile = Math.round((belowCount / annualizedValues.length) * 100);
  }

  // --- RV Rank (min-max scaling) ---
  let rvRank = null;
  if (rvHistory.length >= 20) {
    const annualizedValues = rvHistory.map(r => r.rvAnnualized);
    const rvMin = Math.min(...annualizedValues);
    const rvMax = Math.max(...annualizedValues);
    if (rvMax > rvMin) {
      rvRank = Math.round(((rv20Annualized - rvMin) / (rvMax - rvMin)) * 100);
      rvRank = Math.max(0, Math.min(100, rvRank));
    }
  }

  // --- IV-specific metrics (only when IV is available) ---
  let ivRvRatio = null;
  let volPremium = null;
  let ivPercentile = null;
  let ivRank = null;

  if (currentIV != null && currentIV > 0) {
    // IV / RV ratio: how much options overestimate realized vol
    ivRvRatio = rv20Annualized > 0 ? round2(currentIV / rv20Annualized) : null;

    // Vol premium: IV - RV (in percentage points)
    volPremium = round2((currentIV - rv20Annualized) * 100);

    // IV Percentile: compare current IV against historical RV distribution
    // This is an approximation since we don't have historical IV series.
    // It answers: "Is current IV higher than most historical realized vol periods?"
    if (rvHistory.length >= 20) {
      const annualizedValues = rvHistory.map(r => r.rvAnnualized);
      const belowCount = annualizedValues.filter(v => v < currentIV).length;
      ivPercentile = Math.round((belowCount / annualizedValues.length) * 100);
    }

    // IV Rank against RV history range (not expanded by currentIV)
    // This shows where IV sits relative to the historical RV range.
    // Can exceed 100% conceptually but is clamped — values near 100 mean
    // IV is at or above the highest RV seen in the lookback window.
    if (rvHistory.length >= 20) {
      const annualizedValues = rvHistory.map(r => r.rvAnnualized);
      const rvMin = Math.min(...annualizedValues);
      const rvMax = Math.max(...annualizedValues);
      if (rvMax > rvMin) {
        ivRank = Math.round(((currentIV - rvMin) / (rvMax - rvMin)) * 100);
        ivRank = Math.max(0, Math.min(100, ivRank));
      }
    }
  }

  // --- Volatility Regime ---
  const regime = computeVolRegime(rv20Annualized, rvHistory, currentIV, ivPercentile);

  // --- Premium Quality Score (0-100) ---
  // Only meaningful when IV is available
  let premiumScore = null;
  let premiumLabel = null;
  if (currentIV != null && ivPercentile != null && ivRvRatio != null) {
    // Normalize IV/RV ratio: 1.0 → 0, 1.5 → 50, 2.0+ → 100
    const ivRvNorm = Math.max(0, Math.min(100, ((ivRvRatio - 1.0) / 1.0) * 100));

    // IV trend: compare current IV to RV trend (simple proxy)
    // If IV >> recent RV, premium is likely to stay rich
    const ivTrend = ivRvRatio > 1.3 ? 80 : ivRvRatio > 1.1 ? 50 : 20;

    premiumScore = Math.round(0.45 * ivPercentile + 0.35 * ivRvNorm + 0.20 * ivTrend);
    premiumScore = Math.max(0, Math.min(100, premiumScore));

    premiumLabel = premiumScoreLabel(premiumScore, ivPercentile, ivRvRatio);
  }

  return {
    // Current values
    currentIV: currentIV != null ? round4(currentIV) : null,
    currentIVPct: currentIV != null ? round2(currentIV * 100) : null,
    rv20Annualized: round4(rv20Annualized),
    rv20AnnualizedPct: round2(rv20Annualized * 100),

    // IV metrics (null when no IV)
    ivRvRatio,
    volPremium,
    ivPercentile,
    ivRank,

    // RV metrics (always available)
    rvPercentile,
    rvRank,

    // Regime and scoring
    regime,
    premiumScore,
    premiumLabel,

    // Context
    rvHistoryDays: rvHistory.length,
    rvHistoryRange: rvHistory.length >= 20 ? {
      min: round2(Math.min(...rvHistory.map(r => r.rvAnnualized)) * 100),
      max: round2(Math.max(...rvHistory.map(r => r.rvAnnualized)) * 100),
      median: round2(median(rvHistory.map(r => r.rvAnnualized)) * 100),
    } : null,
  };
}

/**
 * Determine volatility regime from current RV, history, and IV context.
 * When IV is available, blends RV regime with IV percentile to avoid
 * misleading labels (e.g. "compressed" when RV is low but IV is at 100th pctl).
 */
function computeVolRegime(rvAnnualized, rvHistory, currentIV, ivPercentile) {
  if (rvHistory.length < 20) return 'unknown';
  const annualizedValues = rvHistory.map(r => r.rvAnnualized);
  const med = median(annualizedValues);
  const rvRatio = rvAnnualized / med;

  // Pure RV regime
  let rvRegime;
  if (rvRatio > 2.0) rvRegime = 'extreme';
  else if (rvRatio > 1.5) rvRegime = 'elevated';
  else if (rvRatio > 0.8) rvRegime = 'normal';
  else rvRegime = 'compressed';

  // If no IV data, use RV-only regime
  if (currentIV == null || ivPercentile == null) return rvRegime;

  // When IV and RV disagree significantly, adjust the label:
  // - RV says compressed but IV is high → "normal" (market expects vol expansion)
  // - RV says extreme but IV is low → "elevated" (vol spike may not persist)
  if (rvRegime === 'compressed' && ivPercentile >= 70) return 'normal';
  if (rvRegime === 'extreme' && ivPercentile <= 30) return 'elevated';

  return rvRegime;
}

/**
 * Compute premium quality label.
 */
function premiumScoreLabel(score, ivPercentile, ivRvRatio) {
  if (ivPercentile >= 75 && ivRvRatio >= 1.3) return 'rich';
  if (ivPercentile >= 50 && ivRvRatio >= 1.1) return 'moderately attractive';
  if (ivPercentile >= 25) return 'neutral';
  return 'cheap';
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round2(v) {
  return v != null ? Math.round(v * 100) / 100 : null;
}

function round4(v) {
  return v != null ? Math.round(v * 10000) / 10000 : null;
}

module.exports = { computeVolatilityMetrics, computeRollingRV };
