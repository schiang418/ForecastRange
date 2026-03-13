const express = require('express');
const { fetchDividends, fetchSplits } = require('../../src/polygon');

const router = express.Router();

// FOMC meeting dates for 2025-2026 (from federalreserve.gov published schedule)
// Each entry is the last day of the meeting (announcement day)
const FOMC_DATES = [
  // 2025
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  // 2026
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];

function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch upcoming earnings date from Finnhub.
 * Returns array of { date, hour, epsEstimate, revenueEstimate } or empty array.
 */
async function fetchEarnings(ticker, fromDate, toDate) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(ticker)}&from=${fromDate}&to=${toDate}&token=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const entries = data.earningsCalendar || [];

    return entries
      .filter(e => e.symbol === ticker && e.date >= fromDate && e.date <= toDate)
      .map(e => ({
        date: e.date,
        hour: e.hour || null,
        epsEstimate: e.epsEstimate ?? null,
        revenueEstimate: e.revenueEstimate ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * POST /api/events
 * Body: { ticker: string }
 *
 * Returns upcoming key events within the next ~20 trading days:
 * - Earnings (from Finnhub)
 * - FOMC meetings (hardcoded schedule)
 * - Dividends (from Polygon)
 * - Stock splits (from Polygon)
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

    const today = new Date().toISOString().slice(0, 10);
    const endDate = addBusinessDays(today, 20);

    // Collect FOMC dates in range
    const fomcEvents = FOMC_DATES
      .filter(d => d >= today && d <= endDate)
      .map(d => ({
        type: 'fomc',
        date: d,
        label: 'FOMC Decision',
        description: 'Federal Reserve interest rate decision',
      }));

    // Fetch earnings, dividends, and splits in parallel
    const [earnings, dividends, splits] = await Promise.all([
      fetchEarnings(cleanTicker, today, endDate),
      fetchDividends(cleanTicker, today, endDate).catch(() => []),
      fetchSplits(cleanTicker, today, endDate).catch(() => []),
    ]);

    const earningsEvents = earnings.map(e => {
      const hourLabel = e.hour === 'bmo' ? 'Before Open' : e.hour === 'amc' ? 'After Close' : '';
      const parts = ['Earnings'];
      if (hourLabel) parts.push(`(${hourLabel})`);
      return {
        type: 'earnings',
        date: e.date,
        label: parts.join(' '),
        description: e.epsEstimate != null
          ? `Est. EPS: $${e.epsEstimate.toFixed(2)}${e.revenueEstimate != null ? ` | Est. Rev: $${(e.revenueEstimate / 1e9).toFixed(2)}B` : ''}`
          : undefined,
      };
    });

    const dividendEvents = dividends.map(d => ({
      type: 'dividend',
      date: d.exDividendDate,
      label: `Ex-Dividend $${d.cashAmount.toFixed(2)}`,
      description: d.payDate ? `Pay date: ${d.payDate}` : undefined,
    }));

    const splitEvents = splits.map(s => ({
      type: 'split',
      date: s.executionDate,
      label: `Stock Split ${s.splitFrom}:${s.splitTo}`,
      description: `${s.splitTo}-for-${s.splitFrom} split`,
    }));

    // Combine and sort by date
    const events = [...earningsEvents, ...fomcEvents, ...dividendEvents, ...splitEvents]
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ ticker: cleanTicker, events, fromDate: today, toDate: endDate });
  } catch (err) {
    console.error('[events] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
