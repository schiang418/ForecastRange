const { pgTable, serial, varchar, text, numeric, timestamp, uniqueIndex } = require('drizzle-orm/pg-core');

// Phase 3 tables — defined now for schema completeness, used later
const forecasts = pgTable('forecasts', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  spotPrice: numeric('spot_price', { precision: 12, scale: 2 }).notNull(),
  forecastDate: varchar('forecast_date', { length: 10 }).notNull(),
  horizonsJson: text('horizons_json').notNull(),
  profile: varchar('profile', { length: 20 }).default('balanced'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Daily IV snapshots — one row per ticker per date.
// Stores the ATM implied volatility observed on each trading day,
// used for computing true IV percentile and IV rank.
const ivHistory = pgTable('iv_history', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  date: varchar('date', { length: 10 }).notNull(),         // YYYY-MM-DD
  iv: numeric('iv', { precision: 10, scale: 6 }).notNull(), // annualized decimal (e.g. 0.5631)
  source: varchar('source', { length: 20 }).default('live'), // 'live' or 'backfill'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  tickerDateIdx: uniqueIndex('iv_history_ticker_date_idx').on(table.ticker, table.date),
}));

module.exports = { forecasts, ivHistory };
