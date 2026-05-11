/**
 * Mean Reversion Channel (MRC) top-detection signals.
 *
 * Ported from the Pine Script "MRC Top Detection v3 (Hybrid)" indicator.
 * Two markers per bar:
 *   - watch     : overbought-cluster setup confirmed AND a regime gate passed
 *   - confirmed : within `confirmWindow` bars of a watch, a bar closes below
 *                 the watch bar's low (break of structure)
 *
 * The regime gate is hybrid:
 *   - slope deceleration (catches distribution tops), OR
 *   - SMA20 deviation in top 5% over the trailing window (catches blow-off tops)
 */

const PI = Math.PI;
const MULT2 = PI * 2.415;
const GRADSIZE = 0.5;

function superSmoother(series, length = 200) {
  const a1 = Math.exp((-Math.sqrt(2) * PI) / length);
  const b1 = 2 * a1 * Math.cos((Math.sqrt(2) * PI) / length);
  const c3 = -a1 * a1;
  const c2 = b1;
  const c1 = 1 - c2 - c3;
  const out = new Array(series.length).fill(null);
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v == null) continue;
    const prev1 = i >= 1 && out[i - 1] != null ? out[i - 1] : v;
    const prev2 = i >= 2 && out[i - 2] != null ? out[i - 2] : v;
    out[i] = c1 * v + c2 * prev1 + c3 * prev2;
  }
  return out;
}

function trueRangeSeries(bars) {
  const tr = new Array(bars.length).fill(null);
  if (bars.length === 0) return tr;
  tr[0] = bars[0].h - bars[0].l;
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h;
    const l = bars[i].l;
    const prevC = bars[i - 1].c;
    tr[i] = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
  }
  return tr;
}

function mrcBands(bars, length = 200) {
  const src = bars.map(b => (b.h + b.l + b.c) / 3);
  const mean = superSmoother(src, length);
  const meanRange = superSmoother(trueRangeSeries(bars), length);
  return bars.map((_, i) => {
    if (mean[i] == null || meanRange[i] == null) {
      return { mean: null, meanRange: null, upBand2: null, upBand2_1: null, dnBand2_1: null };
    }
    const ext = meanRange[i] * (MULT2 + GRADSIZE * 4);
    return {
      mean: mean[i],
      meanRange: meanRange[i],
      upBand2: mean[i] + meanRange[i] * MULT2,
      upBand2_1: mean[i] + ext,
      dnBand2_1: mean[i] - ext,
    };
  });
}

function rsiSeriesWilder(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  const changes = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function emaSeriesFull(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period) return out;
  const k = 2 / (period + 1);
  let e = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = e;
  for (let i = period; i < closes.length; i++) {
    e = (closes[i] - e) * k + e;
    out[i] = e;
  }
  return out;
}

function smaSeriesFull(closes, period) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Per-bar directional percent rank — for each i, returns the % of the
 * preceding `lookback` values that are strictly less than series[i].
 */
function rollingPercentRank(series, lookback) {
  const out = new Array(series.length).fill(null);
  for (let i = 0; i < series.length; i++) {
    const cur = series[i];
    if (cur == null) continue;
    const start = Math.max(0, i - lookback);
    let total = 0;
    let less = 0;
    for (let j = start; j < i; j++) {
      if (series[j] == null) continue;
      total++;
      if (series[j] < cur) less++;
    }
    out[i] = total > 0 ? (less / total) * 100 : null;
  }
  return out;
}

/**
 * Compute per-bar top-detection markers from raw OHLC bars.
 *
 * @param {Array<{date:string,o:number,h:number,l:number,c:number}>} bars - ascending by date
 * @param {Object} [opts]
 * @returns {{
 *   watch: boolean[],
 *   confirmed: boolean[],
 *   gatePath: ('slope'|'stretch'|'both'|null)[],
 *   stretchPercentile: (number|null)[],
 *   deviationPct: (number|null)[]
 * }}
 */
function mrcTopSignals(bars, opts = {}) {
  const {
    mrcLength = 200,
    rsiPeriod = 14,
    rsiThreshold = 70,
    slopeLookback = 5,
    confirmWindow = 5,
    percLookback = 1260,
    percThreshold = 95,
  } = opts;

  const n = bars.length;
  const watch = new Array(n).fill(false);
  const confirmed = new Array(n).fill(false);
  const gatePath = new Array(n).fill(null);

  if (n < 30) {
    return { watch, confirmed, gatePath, stretchPercentile: new Array(n).fill(null), deviationPct: new Array(n).fill(null) };
  }

  const closes = bars.map(b => b.c);
  const highs = bars.map(b => b.h);
  const lows = bars.map(b => b.l);

  const bands = mrcBands(bars, mrcLength);
  const rsi = rsiSeriesWilder(closes, rsiPeriod);
  const ema20 = emaSeriesFull(closes, 20);
  const sma20 = smaSeriesFull(closes, 20);

  const deviationPct = closes.map((c, i) =>
    sma20[i] != null && sma20[i] !== 0 ? ((c - sma20[i]) / sma20[i]) * 100 : null
  );

  // Use as much history as available, capped at percLookback; require ≥252 bars
  // of history for the percentile to be meaningful.
  const effectivePercLookback = Math.min(percLookback, Math.max(0, n - 1));

  const stretchPercentile = rollingPercentRank(deviationPct, effectivePercLookback);

  const strongOverbought = new Array(n).fill(false);
  for (let i = 3; i < n; i++) {
    const b = bands[i];
    if (!b || b.upBand2_1 == null) continue;
    const isPivotHigh = highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i - 3];
    strongOverbought[i] = closes[i] >= b.upBand2_1 && isPivotHigh;
  }

  let watchLow = null;
  let watchAge = 0;

  for (let i = 5; i < n; i++) {
    // Raw watch conditions (from original Pine logic)
    const prevOB = strongOverbought[i - 1] && rsi[i - 1] != null && rsi[i - 1] > rsiThreshold;
    let higherCount = 0;
    higherCount += highs[i - 1] > highs[i - 2] ? 1 : 0;
    higherCount += highs[i - 1] > highs[i - 3] ? 1 : 0;
    higherCount += highs[i - 1] > highs[i - 4] ? 1 : 0;
    higherCount += highs[i - 1] > highs[i - 5] ? 1 : 0;
    let recentMarkers = 0;
    recentMarkers += strongOverbought[i - 2] ? 1 : 0;
    recentMarkers += strongOverbought[i - 3] ? 1 : 0;
    recentMarkers += strongOverbought[i - 4] ? 1 : 0;
    recentMarkers += strongOverbought[i - 5] ? 1 : 0;
    const watchRaw = prevOB && higherCount >= 2 && recentMarkers >= 2;

    // Gate path 1: trend deceleration on EMA20
    let slopeDecel = false;
    const e0 = ema20[i];
    const e1 = i - slopeLookback >= 0 ? ema20[i - slopeLookback] : null;
    const e2 = i - slopeLookback * 2 >= 0 ? ema20[i - slopeLookback * 2] : null;
    if (e0 != null && e1 != null && e2 != null && e1 !== 0 && e2 !== 0) {
      const slopeNow = (e0 - e1) / e1;
      const slopeOld = (e1 - e2) / e2;
      slopeDecel = slopeNow < slopeOld;
    }

    // Gate path 2: SMA20 deviation at historical extreme (top side)
    const stretchExtreme =
      stretchPercentile[i] != null &&
      stretchPercentile[i] >= percThreshold &&
      deviationPct[i] != null &&
      deviationPct[i] > 0;

    const isWatch = watchRaw && (slopeDecel || stretchExtreme);

    // Confirmation expiration (only when this bar is NOT a new watch)
    if (watchLow != null && !isWatch) {
      watchAge += 1;
      if (watchAge > confirmWindow) {
        watchLow = null;
        watchAge = 0;
      }
    }

    // Confirmation check: close below armed watch low
    if (watchLow != null && closes[i] < watchLow) {
      confirmed[i] = true;
      watchLow = null;
      watchAge = 0;
    }

    // Arm a new watch (overrides any previously armed)
    if (isWatch) {
      watchLow = lows[i];
      watchAge = 0;
      watch[i] = true;
      gatePath[i] = slopeDecel && stretchExtreme ? 'both' : slopeDecel ? 'slope' : 'stretch';
    }
  }

  return { watch, confirmed, gatePath, stretchPercentile, deviationPct };
}

module.exports = {
  superSmoother,
  mrcBands,
  mrcTopSignals,
};
