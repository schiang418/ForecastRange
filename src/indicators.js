/**
 * Technical indicator calculations from raw OHLCV data.
 * All functions expect bars sorted ascending by date.
 *
 * Ported from SwingTrade with additions for forecast engine:
 *   - emaAt(), emaSlope() — EMA at offset and slope
 *   - macd() — MACD (12/26/9)
 *   - realizedVolatility() — Rolling stdev of log returns
 *   - bollingerBands() — Bollinger Bands (20, 2)
 */

/** Simple Moving Average over the last `period` close prices. */
function sma(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** SMA at a specific offset from the end (0 = latest). */
function smaAt(closes, period, offset) {
  if (closes.length < period + offset) return null;
  const end = closes.length - offset;
  const slice = closes.slice(end - period, end);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** Exponential Moving Average over the last N values. Returns latest EMA value. */
function ema(closes, period) {
  if (closes.length < period) return null;
  const multiplier = 2 / (period + 1);
  let emaVal = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    emaVal = (closes[i] - emaVal) * multiplier + emaVal;
  }
  return emaVal;
}

/**
 * Compute full EMA series for all bars (returns array of same length as input).
 * First `period-1` entries are null.
 */
function emaSeries(closes, period) {
  if (closes.length < period) return closes.map(() => null);
  const multiplier = 2 / (period + 1);
  const result = new Array(closes.length).fill(null);
  let emaVal = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  result[period - 1] = emaVal;
  for (let i = period; i < closes.length; i++) {
    emaVal = (closes[i] - emaVal) * multiplier + emaVal;
    result[i] = emaVal;
  }
  return result;
}

/** EMA at a specific offset from the end (0 = latest). */
function emaAt(closes, period, offset) {
  if (offset === 0) return ema(closes, period);
  const trimmed = closes.slice(0, closes.length - offset);
  return ema(trimmed, period);
}

/**
 * EMA slope: percentage change of EMA over `lookback` bars.
 * Returns (ema_now - ema_Nago) / ema_Nago
 */
function emaSlope(closes, period, lookback = 10) {
  const emaNow = emaAt(closes, period, 0);
  const emaAgo = emaAt(closes, period, lookback);
  if (emaNow == null || emaAgo == null || emaAgo === 0) return null;
  return (emaNow - emaAgo) / emaAgo;
}

/**
 * Relative Strength Index.
 * Uses Wilder's smoothing method.
 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Average True Range.
 * Uses Wilder's smoothing.
 */
function atr(bars, period) {
  if (bars.length < period + 1) return null;
  const trSeries = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].h;
    const low = bars[i].l;
    const prevClose = bars[i - 1].c;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSeries.push(tr);
  }
  if (trSeries.length < period) return null;
  let atrVal = trSeries.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trSeries.length; i++) {
    atrVal = (atrVal * (period - 1) + trSeries[i]) / period;
  }
  return atrVal;
}

/** Average volume over the last N bars. */
function avgVolume(bars, period) {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  return slice.reduce((sum, b) => sum + b.v, 0) / period;
}

/** Percentage return over the last N trading days. */
function returnPct(closes, tradingDays) {
  if (closes.length < tradingDays + 1) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - tradingDays];
  return ((current - past) / past) * 100;
}

/**
 * MACD (12/26/9).
 * Returns { macdLine, signalLine, histogram } at the latest bar.
 */
function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) return null;

  // Compute full EMA series for fast and slow
  const fastSeries = emaSeries(closes, fastPeriod);
  const slowSeries = emaSeries(closes, slowPeriod);

  // MACD line = fast EMA - slow EMA (starting from where slow EMA is available)
  const macdValues = [];
  for (let i = 0; i < closes.length; i++) {
    if (fastSeries[i] != null && slowSeries[i] != null) {
      macdValues.push(fastSeries[i] - slowSeries[i]);
    }
  }

  if (macdValues.length < signalPeriod) return null;

  // Signal line = EMA(9) of MACD line
  const signalEma = ema(macdValues, signalPeriod);
  const macdLine = macdValues[macdValues.length - 1];
  const histogram = macdLine - signalEma;

  return { macdLine, signalLine: signalEma, histogram };
}

/**
 * Realized Volatility: rolling standard deviation of daily log returns.
 * Returns annualized sigma_daily (not annualized — raw daily stdev).
 */
function realizedVolatility(closes, window = 20) {
  if (closes.length < window + 1) return null;

  // Compute log returns for the last `window` days
  const logReturns = [];
  const start = closes.length - window;
  for (let i = start; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
  const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance);
}

/**
 * Bollinger Bands (period, numStdDev).
 * Returns { upper, middle, lower, bandwidth }.
 */
function bollingerBands(closes, period = 20, numStdDev = 2) {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  const middle = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + numStdDev * stdDev;
  const lower = middle - numStdDev * stdDev;
  const bandwidth = middle > 0 ? (upper - lower) / middle : 0;

  return { upper, middle, lower, bandwidth };
}

/**
 * Compute all indicators needed for forecast from raw OHLCV bars.
 */
function computeForecastIndicators(bars) {
  if (!bars || bars.length < 80) {
    return { error: 'Insufficient data (need at least 80 trading days)' };
  }

  const closes = bars.map(b => b.c);
  const close = closes[closes.length - 1];

  const ema20 = ema(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(bars, 14);
  const avgVol20 = avgVolume(bars, 20);
  const rv20 = realizedVolatility(closes, 20);
  const macdResult = macd(closes);
  const bb = bollingerBands(closes);
  const ema20Slope = emaSlope(closes, 20, 10);
  const ema50Slope = emaSlope(closes, 50, 10);

  return {
    close,
    ema20,
    sma50,
    rsi14,
    atr14,
    avgVol20,
    rv20,
    macd: macdResult,
    bollingerBands: bb,
    ema20Slope,
    ema50Slope,
  };
}

module.exports = {
  sma, smaAt, ema, emaSeries, emaAt, emaSlope,
  rsi, atr, avgVolume, returnPct,
  macd, realizedVolatility, bollingerBands,
  computeForecastIndicators,
};
