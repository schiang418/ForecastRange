/**
 * Automatic IV history backfill.
 *
 * When a ticker has fewer than 30 IV history rows, generates synthetic
 * IV history from RV data to bootstrap the IV percentile calculation.
 * This runs automatically on first forecast for any ticker.
 *
 * Synthetic IV model: IV_estimated = RV_annualized × ivRvRatio (AR(1) process)
 * This produces a realistic IV distribution that's better than raw RV.
 */
const { computeRollingRV } = require('../src/volatility');
const { extractAtmIV } = require('../src/polygon');
const { bulkUpsertIV, getIVHistoryCount } = require('./ivHistory');

const IV_HISTORY_MIN_DAYS = 30;

// Track in-flight backfills to avoid duplicate concurrent runs
const backfillInProgress = new Set();

/**
 * Check if a ticker needs backfill and run it if so.
 * Non-blocking — runs in background and doesn't delay the forecast response.
 *
 * @param {string} ticker
 * @param {Array} bars - OHLCV bars already fetched
 * @param {Array|null} optionsChain - Options chain already fetched
 * @param {number} spot - Current spot price
 */
async function autoBackfillIfNeeded(ticker, bars, optionsChain, spot) {
  // Skip if already running for this ticker
  if (backfillInProgress.has(ticker)) return;

  try {
    const count = await getIVHistoryCount(ticker);
    if (count >= IV_HISTORY_MIN_DAYS) return; // already have enough data

    backfillInProgress.add(ticker);
    console.log(`[auto-backfill] ${ticker}: only ${count} IV rows, generating synthetic history...`);

    // Get current IV/RV ratio to calibrate the model
    let currentIVRvRatio = 1.5; // default
    if (optionsChain) {
      const expirationIVs = extractAtmIV(optionsChain, spot);
      if (expirationIVs && expirationIVs.length > 0) {
        const currentIV = expirationIVs[0].iv;
        const rvHistory = computeRollingRV(bars, 20);
        if (rvHistory.length > 0) {
          const latestRV = rvHistory[rvHistory.length - 1].rvAnnualized;
          if (latestRV > 0) {
            currentIVRvRatio = currentIV / latestRV;
          }
        }
      }
    }

    // Generate synthetic IV from RV history
    const rvHistory = computeRollingRV(bars, 20);
    if (rvHistory.length < IV_HISTORY_MIN_DAYS) {
      console.warn(`[auto-backfill] ${ticker}: insufficient RV history (${rvHistory.length} days)`);
      return;
    }

    const rows = generateSyntheticIV(ticker, rvHistory, currentIVRvRatio);
    await bulkUpsertIV(rows, 'backfill');

    const newCount = await getIVHistoryCount(ticker);
    console.log(`[auto-backfill] ${ticker}: backfill complete, now ${newCount} IV rows`);
  } catch (err) {
    console.warn(`[auto-backfill] ${ticker}: failed: ${err.message}`);
  } finally {
    backfillInProgress.delete(ticker);
  }
}

/**
 * Generate synthetic IV rows from RV history using AR(1) IV/RV ratio model.
 */
function generateSyntheticIV(ticker, rvHistory, targetRatio) {
  const ratioMean = Math.max(1.1, Math.min(2.5, targetRatio));
  const alpha = 0.92;
  const sigma = 0.08;

  // Seeded RNG for reproducibility
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

  let ratio = ratioMean;
  const rows = [];

  for (const rv of rvHistory) {
    ratio = alpha * ratio + (1 - alpha) * ratioMean + sigma * gaussianNoise();
    ratio = Math.max(0.8, Math.min(3.0, ratio));
    const syntheticIV = rv.rvAnnualized * ratio;

    rows.push({
      ticker,
      date: rv.date,
      iv: Math.round(syntheticIV * 1000000) / 1000000,
    });
  }

  return rows;
}

module.exports = { autoBackfillIfNeeded };
