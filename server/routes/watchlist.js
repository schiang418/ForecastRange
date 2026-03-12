const express = require('express');
const { getDb, ensureAuthTables } = require('../db');
const { sql } = require('drizzle-orm');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All watchlist routes require authentication
router.use(requireAuth);

// ── GET /api/watchlist ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    await ensureAuthTables();
    const db = getDb();
    const result = await db.execute(
      sql`SELECT ticker, added_at FROM watchlist WHERE user_id = ${req.user.id} ORDER BY added_at DESC`
    );
    res.json({ tickers: result.rows });
  } catch (err) {
    console.error('[watchlist] GET error:', err.message);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
});

// ── POST /api/watchlist ──────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { ticker } = req.body;
    if (!ticker || typeof ticker !== 'string') {
      return res.status(400).json({ error: 'Missing ticker' });
    }

    const sanitized = ticker.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10);
    if (!sanitized) {
      return res.status(400).json({ error: 'Invalid ticker' });
    }

    await ensureAuthTables();
    const db = getDb();
    await db.execute(
      sql`INSERT INTO watchlist (user_id, ticker) VALUES (${req.user.id}, ${sanitized}) ON CONFLICT (user_id, ticker) DO NOTHING`
    );

    res.json({ success: true, ticker: sanitized });
  } catch (err) {
    console.error('[watchlist] POST error:', err.message);
    res.status(500).json({ error: 'Failed to add ticker' });
  }
});

// ── DELETE /api/watchlist/:ticker ─────────────────────────────
router.delete('/:ticker', async (req, res) => {
  try {
    const sanitized = req.params.ticker.toUpperCase().replace(/[^A-Z]/g, '');
    if (!sanitized) {
      return res.status(400).json({ error: 'Invalid ticker' });
    }

    await ensureAuthTables();
    const db = getDb();
    await db.execute(
      sql`DELETE FROM watchlist WHERE user_id = ${req.user.id} AND ticker = ${sanitized}`
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[watchlist] DELETE error:', err.message);
    res.status(500).json({ error: 'Failed to remove ticker' });
  }
});

module.exports = router;
