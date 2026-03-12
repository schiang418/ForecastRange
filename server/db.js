require('dotenv').config();
const { drizzle } = require('drizzle-orm/node-postgres');
const { sql } = require('drizzle-orm');
const { Pool } = require('pg');
const schema = require('./schema');

let db = null;
let pool = null;

function getDb() {
  if (!db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

function getEasternDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Ensure the iv_history table exists in the database.
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to call on every request.
 * Cached after first successful run so subsequent calls are no-ops.
 */
let tableEnsured = false;
async function ensureIVHistoryTable() {
  if (tableEnsured) return;
  const db = getDb();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS iv_history (
       id SERIAL PRIMARY KEY,
       ticker VARCHAR(20) NOT NULL,
       date VARCHAR(10) NOT NULL,
       iv NUMERIC(10,6) NOT NULL,
       source VARCHAR(20) DEFAULT 'live',
       created_at TIMESTAMP DEFAULT NOW() NOT NULL
     )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS iv_history_ticker_date_idx ON iv_history (ticker, date)`);
  tableEnsured = true;
  console.log('[db] iv_history table ensured');
}

module.exports = { getDb, getEasternDate, ensureIVHistoryTable };
