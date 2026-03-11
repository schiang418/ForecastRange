const { pgTable, serial, varchar, text, numeric, timestamp } = require('drizzle-orm/pg-core');

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

module.exports = { forecasts };
