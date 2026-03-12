#!/usr/bin/env node
/**
 * Backfill IV history from Polygon.io historical options data.
 *
 * Strategy: For each past trading day, fetch the options chain aggregates
 * for ATM contracts and reconstruct the implied volatility.
 *
 * Polygon's /v3/reference/options/contracts endpoint lists available contracts,
 * and /v3/snapshot/options/{ticker} only gives current data.
 *
 * For historical IV, we use Polygon's /v2/aggs/ticker/{optionsTicker}/range/1/day/...
 * endpoint to get historical option prices, then reconstruct IV via put-call parity
 * or use a simpler approach: fetch daily bars for the underlying and compute
 * a synthetic IV proxy from short-dated options implied moves.
 *
 * SIMPLER APPROACH (implemented here):
 * Since Polygon's snapshot endpoint is current-only and historical options
 * reconstruction is expensive, we use a practical hybrid:
 *
 * 1. For each past trading day, estimate IV from the underlying's price data
 *    using the realized vol as a floor and applying the current IV/RV ratio
 *    as a scaling factor (mean-reverting IV model).
 * 2. This produces a realistic IV history that's better than using RV directly,
 *    while we accumulate real IV snapshots going forward.
 *
 * Usage:
 *   node scripts/backfill-iv.js TSLA [--days 252]
 *   node scripts/backfill-iv.js TSLA --live  (fetch current IV and store one snapshot)
 */
require('dotenv').config();
const { fetchDailyBars, fetchOptionsChain, extractAtmIV, sleep } = require('../src/polygon');
const { computeRollingRV } = require('../src/volatility');
const { bulkUpsertIV, upsertIV, getIVHistoryCount } = require('../server/ivHistory');

const USAGE = `Usage: node scripts/backfill-iv.js <TICKER> [--days N] [--live]

Options:
  --days N    Number of trading days to backfill (default: 252)
  --live      Fetch current IV from Polygon and store a single snapshot
  --force     Overwrite existing backfill data (re-inserts, existing live data preserved)
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log(USAGE);
    process.exit(0);
  }

  const ticker = args[0].toUpperCase();
  const isLive = args.includes('--live');
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : 252;

  if (isLive) {
    await backfillLive(ticker);
  } else {
    await backfillSynthetic(ticker, days);
  }

  process.exit(0);
}

/**
 * Fetch current options chain and store today's IV as a live snapshot.
 */
async function backfillLive(ticker) {
  console.log(`[backfill] Fetching live options data for ${ticker}...`);

  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [bars, optionsChain] = await Promise.all([
    fetchDailyBars(ticker, fromDate, toDate),
    fetchOptionsChain(ticker),
  ]);

  if (!bars || bars.length === 0) {
    console.error(`[backfill] No bars for ${ticker}`);
    return;
  }

  const spot = bars[bars.length - 1].c;
  const expirationIVs = extractAtmIV(optionsChain, spot);

  if (!expirationIVs || expirationIVs.length === 0) {
    console.error(`[backfill] No IV data available for ${ticker}`);
    return;
  }

  const currentIV = expirationIVs[0].iv;
  const today = new Date().toISOString().slice(0, 10);

  await upsertIV(ticker, today, currentIV, 'live');
  console.log(`[backfill] Stored live IV for ${ticker} on ${today}: ${(currentIV * 100).toFixed(2)}%`);
}

/**
 * Generate synthetic IV history using RV + IV/RV ratio model.
 *
 * Model: For each past day, IV_estimated = RV_annualized × ivRvRatio_smoothed
 * where ivRvRatio_smoothed mean-reverts toward the current IV/RV ratio
 * with some noise to create realistic dispersion.
 *
 * This is NOT real IV — it's a realistic proxy that produces a more
 * meaningful percentile distribution than using raw RV.
 */
async function backfillSynthetic(ticker, days) {
  console.log(`[backfill] Generating synthetic IV history for ${ticker} (${days} days)...`);

  // Fetch enough bars for RV calculation + requested days
  const calendarDays = Math.ceil(days * 1.5) + 60;
  const toDate = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - calendarDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  console.log(`[backfill] Fetching bars from ${fromDate} to ${toDate}...`);
  const bars = await fetchDailyBars(ticker, fromDate, toDate);

  if (!bars || bars.length < 80) {
    console.error(`[backfill] Insufficient data: ${bars?.length || 0} bars`);
    return;
  }

  // Get current IV to calibrate the model
  let currentIVRvRatio = 1.5; // default assumption
  let currentIV = null;
  try {
    console.log(`[backfill] Fetching current options chain...`);
    const optionsChain = await fetchOptionsChain(ticker);
    const spot = bars[bars.length - 1].c;
    const expirationIVs = extractAtmIV(optionsChain, spot);
    if (expirationIVs && expirationIVs.length > 0) {
      currentIV = expirationIVs[0].iv;
      const rvHistory = computeRollingRV(bars, 20);
      if (rvHistory.length > 0) {
        const latestRV = rvHistory[rvHistory.length - 1].rvAnnualized;
        if (latestRV > 0) {
          currentIVRvRatio = currentIV / latestRV;
          console.log(`[backfill] Current IV: ${(currentIV * 100).toFixed(1)}%, RV: ${(latestRV * 100).toFixed(1)}%, ratio: ${currentIVRvRatio.toFixed(2)}x`);
        }
      }
    }
  } catch (err) {
    console.warn(`[backfill] Could not fetch current IV, using default ratio: ${err.message}`);
  }

  // Compute rolling RV for all bars
  const rvHistory = computeRollingRV(bars, 20);
  if (rvHistory.length === 0) {
    console.error(`[backfill] Could not compute RV history`);
    return;
  }

  // Generate synthetic IV for each day
  // Model: IV = RV × ratio, where ratio mean-reverts with noise
  // This creates a realistic distribution where IV is usually > RV
  // but not always, and has its own variance structure
  const rows = [];
  const targetRatio = currentIVRvRatio;
  const ratioMean = Math.max(1.1, Math.min(2.5, targetRatio)); // clamp to realistic range

  // Use a simple AR(1) process for the ratio: ratio_t = alpha * ratio_{t-1} + (1-alpha) * mean + noise
  const alpha = 0.92; // persistence
  const sigma = 0.08; // noise scale
  let ratio = ratioMean;

  // Seed RNG for reproducibility (use ticker hash)
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = ((seed << 5) - seed + ticker.charCodeAt(i)) | 0;
  function seededRandom() {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  function gaussianNoise() {
    const u1 = seededRandom();
    const u2 = seededRandom();
    return Math.sqrt(-2 * Math.log(Math.max(0.0001, u1))) * Math.cos(2 * Math.PI * u2);
  }

  // Take the last N RV entries matching requested days
  const rvSlice = rvHistory.slice(-days);
  for (const rv of rvSlice) {
    // Evolve ratio with mean reversion + noise
    ratio = alpha * ratio + (1 - alpha) * ratioMean + sigma * gaussianNoise();
    ratio = Math.max(0.8, Math.min(3.0, ratio)); // keep ratio sane

    const syntheticIV = rv.rvAnnualized * ratio;

    rows.push({
      ticker,
      date: rv.date,
      iv: Math.round(syntheticIV * 1000000) / 1000000, // 6 decimal places
    });
  }

  // Store today's actual IV if we have it (as 'live', not 'backfill')
  if (currentIV != null) {
    const today = new Date().toISOString().slice(0, 10);
    await upsertIV(ticker, today, currentIV, 'live');
    console.log(`[backfill] Stored live IV for today: ${(currentIV * 100).toFixed(2)}%`);
  }

  // Bulk insert synthetic history
  console.log(`[backfill] Inserting ${rows.length} synthetic IV rows...`);
  await bulkUpsertIV(rows, 'backfill');

  const count = await getIVHistoryCount(ticker);
  console.log(`[backfill] Done. Total IV history rows for ${ticker}: ${count}`);
  console.log(`[backfill] Note: Synthetic IV is a proxy based on RV × IV/RV ratio model.`);
  console.log(`[backfill] Real IV snapshots will accumulate automatically on each forecast run.`);
}

main().catch(err => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});
