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
 * POST /api/events
 * Body: { ticker: string }
 *
 * Returns upcoming key events within the next ~30 calendar days:
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

    // Fetch dividends and splits in parallel
    const [dividends, splits] = await Promise.all([
      fetchDividends(cleanTicker, today, endDate).catch(() => []),
      fetchSplits(cleanTicker, today, endDate).catch(() => []),
    ]);

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
    const events = [...fomcEvents, ...dividendEvents, ...splitEvents]
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ ticker: cleanTicker, events, fromDate: today, toDate: endDate });
  } catch (err) {
    console.error('[events] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
