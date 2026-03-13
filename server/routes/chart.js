const express = require('express');
const { fetchDailyBars } = require('../../src/polygon');

const router = express.Router();

/**
 * Compute full SMA series for all bars.
 * Returns array of same length as closes (null where insufficient data).
 */
function smaSeries(closes, period) {
  const result = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    result[i] = sum / period;
  }
  return result;
}

/**
 * Compute full RSI series using Wilder's smoothing.
 * Returns array of same length as closes (null where insufficient data).
 */
function rsiSeries(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

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

  // First RSI value at index period
  if (avgLoss === 0) result[period] = 100;
  else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }

  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) result[i + 1] = 100;
    else {
      const rs = avgGain / avgLoss;
      result[i + 1] = Math.round((100 - 100 / (1 + rs)) * 100) / 100;
    }
  }
  return result;
}

/**
 * Compute full Bollinger Bands series.
 * Returns array of { upper, middle, lower } (null where insufficient data).
 */
function bollingerSeries(closes, period = 20, numStdDev = 2) {
  const result = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const middle = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    result[i] = {
      upper: middle + numStdDev * stdDev,
      middle,
      lower: middle - numStdDev * stdDev,
    };
  }
  return result;
}

/**
 * POST /api/chart
 * Body: { ticker: string, period?: "3m" | "6m" | "1y" | "2y" }
 *
 * Returns OHLCV bars with SMA20, SMA50, and Bollinger Bands overlays.
 */
router.post('/', async (req, res) => {
  try {
    const { ticker, period = '6m' } = req.body;

    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'ticker is required' });
    }

    const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10);
    if (!cleanTicker) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }

    // Map period to calendar days (add extra for SMA200 + indicator warm-up)
    const periodDays = {
      '3m': 90 + 300,
      '6m': 180 + 300,
      '1y': 365 + 300,
      '2y': 730 + 300,
    };
    const totalDays = periodDays[period] || periodDays['6m'];

    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - totalDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    console.log(`[chart] Fetching ${cleanTicker} bars from ${fromDate} to ${toDate} (period: ${period})`);

    const bars = await fetchDailyBars(cleanTicker, fromDate, toDate);

    if (!bars || bars.length === 0) {
      return res.status(404).json({ error: `No data found for ticker ${cleanTicker}` });
    }

    const closes = bars.map(b => b.c);

    // Compute indicator series
    const sma20Series = smaSeries(closes, 20);
    const sma50Series = smaSeries(closes, 50);
    const sma200Series = smaSeries(closes, 200);
    const bbSeries = bollingerSeries(closes, 20, 2);
    const rsi14Series = rsiSeries(closes, 14);

    // Trim warm-up bars (first 50 entries may lack indicators)
    // Only return the requested visible period
    const visibleDays = {
      '3m': 63,   // ~3 months of trading days
      '6m': 126,
      '1y': 252,
      '2y': 504,
    };
    const visible = visibleDays[period] || visibleDays['6m'];
    const startIdx = Math.max(0, bars.length - visible);

    const chartData = [];
    for (let i = startIdx; i < bars.length; i++) {
      const bar = bars[i];
      const bb = bbSeries[i];
      chartData.push({
        date: bar.date,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        sma20: sma20Series[i] != null ? Math.round(sma20Series[i] * 100) / 100 : null,
        sma50: sma50Series[i] != null ? Math.round(sma50Series[i] * 100) / 100 : null,
        sma200: sma200Series[i] != null ? Math.round(sma200Series[i] * 100) / 100 : null,
        bbUpper: bb ? Math.round(bb.upper * 100) / 100 : null,
        bbMiddle: bb ? Math.round(bb.middle * 100) / 100 : null,
        bbLower: bb ? Math.round(bb.lower * 100) / 100 : null,
        rsi14: rsi14Series[i],
      });
    }

    res.json({
      ticker: cleanTicker,
      period,
      bars: chartData,
    });
  } catch (err) {
    console.error('[chart] Error:', err);

    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
