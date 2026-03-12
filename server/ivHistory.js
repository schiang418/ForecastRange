/**
 * IV History store — insert and query daily IV snapshots from PostgreSQL.
 *
 * Used to compute true IV percentile (current IV vs historical IV distribution)
 * instead of the RV-based approximation.
 */
const { eq, and, desc, sql } = require('drizzle-orm');
const { getDb } = require('./db');
const { ivHistory } = require('./schema');

/**
 * Upsert a single IV snapshot for a ticker on a given date.
 * If a row already exists for (ticker, date), it is left unchanged (first-write wins).
 *
 * @param {string} ticker - e.g. 'TSLA'
 * @param {string} date   - YYYY-MM-DD
 * @param {number} iv     - annualized IV decimal (e.g. 0.5631 for 56.31%)
 * @param {string} source - 'live' | 'backfill'
 */
async function upsertIV(ticker, date, iv, source = 'live') {
  const db = getDb();
  await db.insert(ivHistory)
    .values({ ticker, date, iv: iv.toString(), source })
    .onConflictDoNothing({ target: [ivHistory.ticker, ivHistory.date] });
}

/**
 * Bulk insert IV snapshots (for backfill). Skips conflicts.
 *
 * @param {Array<{ticker: string, date: string, iv: number}>} rows
 * @param {string} source
 */
async function bulkUpsertIV(rows, source = 'backfill') {
  if (!rows || rows.length === 0) return;
  const db = getDb();
  const values = rows.map(r => ({
    ticker: r.ticker,
    date: r.date,
    iv: r.iv.toString(),
    source,
  }));
  // Insert in batches of 500 to avoid query size limits
  for (let i = 0; i < values.length; i += 500) {
    const batch = values.slice(i, i + 500);
    await db.insert(ivHistory)
      .values(batch)
      .onConflictDoNothing({ target: [ivHistory.ticker, ivHistory.date] });
  }
}

/**
 * Fetch IV history for a ticker, ordered by date descending.
 * Returns up to `limit` most recent rows.
 *
 * @param {string} ticker
 * @param {number} limit - max rows (default 252 = ~1 year)
 * @returns {Promise<Array<{date: string, iv: number}>>}
 */
async function getIVHistory(ticker, limit = 252) {
  const db = getDb();
  const rows = await db.select({
    date: ivHistory.date,
    iv: ivHistory.iv,
  })
    .from(ivHistory)
    .where(eq(ivHistory.ticker, ticker))
    .orderBy(desc(ivHistory.date))
    .limit(limit);

  return rows.map(r => ({
    date: r.date,
    iv: parseFloat(r.iv),
  }));
}

/**
 * Count IV history rows for a ticker.
 */
async function getIVHistoryCount(ticker) {
  const db = getDb();
  const result = await db.select({
    count: sql`count(*)::int`,
  })
    .from(ivHistory)
    .where(eq(ivHistory.ticker, ticker));
  return result[0]?.count || 0;
}

/**
 * Delete all backfill-sourced rows for a ticker (preserves live data).
 */
async function deleteBackfillData(ticker) {
  const db = getDb();
  await db.delete(ivHistory)
    .where(and(eq(ivHistory.ticker, ticker), eq(ivHistory.source, 'backfill')));
}

module.exports = { upsertIV, bulkUpsertIV, getIVHistory, getIVHistoryCount, deleteBackfillData };
