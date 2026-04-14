const express = require('express');
const { fetchDailyBars } = require('../../src/polygon');

const router = express.Router();

/**
 * Compute SMA array from close prices.
 * Returns array of same length as closes, null where insufficient data.
 */
function computeSMA(closes, period) {
  const result = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

/**
 * Classify deviation into extension zones.
 */
function classifyExtension(percentileRank, deviationPct) {
  const direction = deviationPct >= 0 ? 'above' : 'below';
  let zone;
  if (percentileRank >= 95) zone = 'EXTREMELY_EXTENDED';
  else if (percentileRank >= 85) zone = 'VERY_EXTENDED';
  else if (percentileRank >= 70) zone = 'EXTENDED';
  else if (percentileRank >= 30) zone = 'NORMAL';
  else if (percentileRank >= 15) zone = 'COMPRESSED';
  else if (percentileRank >= 5) zone = 'VERY_COMPRESSED';
  else zone = 'EXTREMELY_COMPRESSED';
  return { zone, direction };
}

/**
 * Build histogram of deviation values.
 */
function buildHistogram(deviations, binWidth = 1) {
  if (deviations.length === 0) return [];
  const min = Math.floor(Math.min(...deviations));
  const max = Math.ceil(Math.max(...deviations));
  const bins = [];
  for (let start = min; start < max; start += binWidth) {
    const end = start + binWidth;
    const count = deviations.filter(d => d >= start && d < end).length;
    bins.push({
      binStart: start,
      binEnd: end,
      count,
      pct: parseFloat(((count / deviations.length) * 100).toFixed(2)),
    });
  }
  return bins;
}

/**
 * Analyze deviation from a single SMA period.
 */
function analyzeSingleSMA(bars, period) {
  const closes = bars.map(b => b.c);
  const smaValues = computeSMA(closes, period);

  const deviations = [];
  for (let i = 0; i < bars.length; i++) {
    if (smaValues[i] === null) continue;
    deviations.push(((closes[i] - smaValues[i]) / smaValues[i]) * 100);
  }

  if (deviations.length === 0) return null;

  const currentDev = deviations[deviations.length - 1];
  const currentClose = closes[closes.length - 1];
  const currentSMA = smaValues[smaValues.length - 1];

  // Percentile rank: % of days where |deviation| was LESS than |current|
  const absCurrentDev = Math.abs(currentDev);
  const lessExtreme = deviations.filter(d => Math.abs(d) < absCurrentDev).length;
  const percentileRank = (lessExtreme / deviations.length) * 100;

  // Directional percentile
  const directionalLess = deviations.filter(d => d < currentDev).length;
  const directionalPercentile = (directionalLess / deviations.length) * 100;

  // Distribution stats
  const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  const variance = deviations.reduce((a, b) => a + (b - mean) ** 2, 0) / deviations.length;
  const stdDev = Math.sqrt(variance);
  const zScore = stdDev > 0 ? (currentDev - mean) / stdDev : 0;

  // Frequency label: how often does a deviation this extreme happen?
  const pctOfTime = 100 - percentileRank;
  let frequencyLabel;
  if (pctOfTime <= 5) frequencyLabel = 'Extremely rare (< 5% of the time)';
  else if (pctOfTime <= 10) frequencyLabel = 'Very rare (< 10% of the time)';
  else if (pctOfTime <= 20) frequencyLabel = 'Uncommon (< 20% of the time)';
  else if (pctOfTime <= 35) frequencyLabel = 'Somewhat uncommon';
  else frequencyLabel = 'Within normal range';

  // Approximate years from trading days (252 trading days per year)
  const approxYears = parseFloat((deviations.length / 252).toFixed(1));

  return {
    period,
    value: parseFloat(currentSMA.toFixed(2)),
    deviationDollars: parseFloat((currentClose - currentSMA).toFixed(2)),
    deviationPct: parseFloat(currentDev.toFixed(4)),
    percentileRank: parseFloat(percentileRank.toFixed(2)),
    directionalPercentile: parseFloat(directionalPercentile.toFixed(2)),
    frequencyLabel,
    extension: classifyExtension(percentileRank, currentDev),
    distribution: {
      mean: parseFloat(mean.toFixed(4)),
      stdDev: parseFloat(stdDev.toFixed(4)),
      min: parseFloat(Math.min(...deviations).toFixed(4)),
      max: parseFloat(Math.max(...deviations).toFixed(4)),
    },
    tradingDaysAnalyzed: deviations.length,
    approxYears,
    histogram: buildHistogram(deviations),
  };
}

/**
 * Generate interpretation text.
 */
function generateInterpretation(ticker, sma20, sma50) {
  const parts = [];
  if (sma20) {
    const dir = sma20.deviationPct >= 0 ? 'above' : 'below';
    parts.push(
      `${ticker} is ${Math.abs(sma20.deviationPct).toFixed(1)}% ${dir} its 20-day SMA ($${sma20.value.toFixed(2)}).` +
      ` This deviation is more extreme than ${sma20.percentileRank.toFixed(1)}% of trading days over the past ~5 years.` +
      ` Zone: ${sma20.extension.zone}.`
    );
    if (sma20.percentileRank >= 90) {
      parts.push('CAUTION: Stock is at historically extreme extension from the 20-day SMA. Mean reversion risk is elevated.');
    } else if (sma20.percentileRank >= 75) {
      parts.push('Stock is notably extended from the 20-day SMA. Watch for potential pullback.');
    }
  }
  if (sma50) {
    const dir = sma50.deviationPct >= 0 ? 'above' : 'below';
    parts.push(
      `${ticker} is ${Math.abs(sma50.deviationPct).toFixed(1)}% ${dir} its 50-day SMA ($${sma50.value.toFixed(2)}).` +
      ` Percentile rank: ${sma50.percentileRank.toFixed(1)}%. Zone: ${sma50.extension.zone}.`
    );
    if (sma50.percentileRank >= 90) {
      parts.push('CAUTION: Stock is at historically extreme extension from the 50-day SMA. Mean reversion risk is elevated.');
    }
  }
  return parts.join(' ');
}

/**
 * POST /api/deviation
 * Body: { ticker: string }
 *
 * Fetches ~5 years of daily OHLC, computes 20-day and 50-day SMA deviation
 * analysis with percentile rank, z-score, and extension zone classification.
 */
router.post('/', async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'ticker is required' });
    }

    const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 10);
    if (!cleanTicker) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }

    // ~5 years of calendar days + buffer for SMA warm-up
    const calendarDays = 1850 + 60;
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - calendarDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    console.log(`[deviation] Fetching ${cleanTicker} bars from ${fromDate} to ${toDate}`);
    const bars = await fetchDailyBars(cleanTicker, fromDate, toDate);

    if (!bars || bars.length < 50) {
      return res.status(404).json({ error: `Insufficient data for ${cleanTicker} (need at least 50 bars, got ${bars?.length || 0})` });
    }

    console.log(`[deviation] ${cleanTicker}: ${bars.length} bars, analyzing...`);

    const sma20 = analyzeSingleSMA(bars, 20);
    const sma50 = analyzeSingleSMA(bars, 50);
    const latestBar = bars[bars.length - 1];

    res.json({
      ticker: cleanTicker,
      date: latestBar.date,
      price: latestBar.c,
      tradingDaysAnalyzed: bars.length,
      sma20,
      sma50,
      interpretation: generateInterpretation(cleanTicker, sma20, sma50),
    });
  } catch (err) {
    console.error('[deviation] Error:', err);
    if (err.message?.includes('429') || err.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
