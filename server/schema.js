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

// Users — OAuth providers (Apple, Google)
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  provider: varchar('provider', { length: 20 }).notNull(),       // 'apple' or 'google'
  providerId: varchar('provider_id', { length: 255 }).notNull(), // sub from OAuth
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  providerIdx: uniqueIndex('users_provider_idx').on(table.provider, table.providerId),
}));

// Watchlist — saved tickers per user
const watchlist = pgTable('watchlist', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull(),
  ticker: varchar('ticker', { length: 20 }).notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, (table) => ({
  userTickerIdx: uniqueIndex('watchlist_user_ticker_idx').on(table.userId, table.ticker),
}));

module.exports = { forecasts, ivHistory, users, watchlist };
