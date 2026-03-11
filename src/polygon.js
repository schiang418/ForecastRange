const API_BASE = 'https://api.polygon.io';

function getApiKey() {
  const key = process.env.MASSIVE_STOCK_API_KEY;
  if (!key) throw new Error('MASSIVE_STOCK_API_KEY environment variable is not set');
  return key;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch daily OHLCV bars for a ticker over a date range.
 * Returns array of { t, date, o, h, l, c, v } sorted ascending by date.
 */
async function fetchDailyBars(ticker, fromDate, toDate) {
  const apiKey = getApiKey();
  const url = `${API_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Polygon API error for ${ticker}: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.status === 'ERROR') {
    throw new Error(`Polygon API error for ${ticker}: ${data.error}`);
  }

  return (data.results || []).map(bar => ({
    t: bar.t,
    date: new Date(bar.t).toISOString().slice(0, 10),
    o: bar.o,
    h: bar.h,
    l: bar.l,
    c: bar.c,
    v: bar.v,
  }));
}

/**
 * Fetch options chain snapshot for a ticker.
 * Returns array of option contract snapshots with IV, Greeks, etc.
 *
 * Uses GET /v3/snapshot/options/{underlyingAsset}
 * Filterable by strike_price, expiration_date, contract_type.
 */
async function fetchOptionsChain(ticker, { expirationDate, contractType, strikePrice } = {}) {
  const apiKey = getApiKey();
  const params = new URLSearchParams({ apiKey, limit: '250' });

  if (expirationDate) params.set('expiration_date', expirationDate);
  if (contractType) params.set('contract_type', contractType);
  if (strikePrice) params.set('strike_price', strikePrice);

  const url = `${API_BASE}/v3/snapshot/options/${encodeURIComponent(ticker)}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    // Options data may not be available for all tickers — graceful fallback
    if (res.status === 404 || res.status === 403) {
      return [];
    }
    const text = await res.text();
    throw new Error(`Polygon options API error for ${ticker}: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (data.status === 'ERROR') {
    return [];
  }

  return data.results || [];
}

/**
 * Extract ATM implied volatility from options chain snapshot.
 * Finds call and put contracts closest to spot price for each relevant expiration.
 *
 * Returns { iv, expirationDate, contractsUsed } or null if insufficient data.
 */
function extractAtmIV(optionsChain, spotPrice) {
  if (!optionsChain || optionsChain.length === 0) return null;

  // Filter to contracts with valid IV
  const validContracts = optionsChain.filter(c =>
    c.implied_volatility != null &&
    c.implied_volatility > 0 &&
    c.details?.strike_price != null
  );

  if (validContracts.length < 5) return null;

  // Group by expiration date
  const byExpiration = {};
  for (const c of validContracts) {
    const exp = c.details.expiration_date;
    if (!byExpiration[exp]) byExpiration[exp] = [];
    byExpiration[exp].push(c);
  }

  // For each expiration, find ATM contracts (closest to spot)
  const expirationIVs = [];
  for (const [exp, contracts] of Object.entries(byExpiration)) {
    // Sort by distance from spot
    contracts.sort((a, b) =>
      Math.abs(a.details.strike_price - spotPrice) - Math.abs(b.details.strike_price - spotPrice)
    );

    // Take the 2-4 closest contracts and average their IV
    const atm = contracts.slice(0, 4);
    const avgIV = atm.reduce((sum, c) => sum + c.implied_volatility, 0) / atm.length;

    expirationIVs.push({
      expirationDate: exp,
      iv: avgIV,
      contractsUsed: atm.length,
    });
  }

  if (expirationIVs.length === 0) return null;

  // Sort by expiration date
  expirationIVs.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));

  return expirationIVs;
}

module.exports = { fetchDailyBars, fetchOptionsChain, extractAtmIV, sleep };
