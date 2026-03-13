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
  // Cap IV at 500% (5.0) — Polygon can return absurdly high IV for
  // near-expiration or illiquid contracts which distorts the average
  const validContracts = optionsChain.filter(c =>
    c.implied_volatility != null &&
    c.implied_volatility > 0 &&
    c.implied_volatility <= 5.0 &&
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
    // Only consider contracts within 20% of spot to avoid deep ITM/OTM skew
    const nearAtm = contracts.filter(c =>
      Math.abs(c.details.strike_price - spotPrice) / spotPrice <= 0.20
    );
    if (nearAtm.length === 0) continue;

    // Sort by distance from spot
    nearAtm.sort((a, b) =>
      Math.abs(a.details.strike_price - spotPrice) - Math.abs(b.details.strike_price - spotPrice)
    );

    // Take the 2-4 closest contracts and average their IV
    const atm = nearAtm.slice(0, 4);
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

/**
 * Extract ATM straddle expected move from options chain snapshot.
 * For each expiration, finds the ATM call and put and computes:
 *   straddle = call_mid + put_mid
 *   expectedMove = 0.85 × straddle (industry standard factor)
 *
 * Returns array of { expirationDate, strike, callMid, putMid, straddle, expectedMove }
 * sorted by expiration date, or null if insufficient data.
 */
function extractAtmStraddle(optionsChain, spotPrice) {
  if (!optionsChain || optionsChain.length === 0) return null;

  // Filter to contracts with valid quote data
  const validContracts = optionsChain.filter(c =>
    c.details?.strike_price != null &&
    c.details?.contract_type != null &&
    c.details?.expiration_date != null &&
    c.last_quote?.midpoint > 0
  );

  if (validContracts.length < 4) return null;

  // Group by expiration
  const byExpiration = {};
  for (const c of validContracts) {
    const exp = c.details.expiration_date;
    if (!byExpiration[exp]) byExpiration[exp] = { calls: [], puts: [] };
    if (c.details.contract_type === 'call') {
      byExpiration[exp].calls.push(c);
    } else if (c.details.contract_type === 'put') {
      byExpiration[exp].puts.push(c);
    }
  }

  const results = [];
  for (const [exp, { calls, puts }] of Object.entries(byExpiration)) {
    if (calls.length === 0 || puts.length === 0) continue;

    // Find the ATM strike: the strike closest to spot that has BOTH a call and a put
    const callStrikes = new Set(calls.map(c => c.details.strike_price));
    const putStrikes = new Set(puts.map(c => c.details.strike_price));
    const commonStrikes = [...callStrikes].filter(s => putStrikes.has(s));

    if (commonStrikes.length === 0) continue;

    // Find the closest common strike to spot
    commonStrikes.sort((a, b) => Math.abs(a - spotPrice) - Math.abs(b - spotPrice));
    const atmStrike = commonStrikes[0];

    const atmCall = calls.find(c => c.details.strike_price === atmStrike);
    const atmPut = puts.find(c => c.details.strike_price === atmStrike);

    if (!atmCall || !atmPut) continue;

    const callMid = atmCall.last_quote.midpoint;
    const putMid = atmPut.last_quote.midpoint;
    const straddle = callMid + putMid;
    const expectedMove = 0.85 * straddle;

    results.push({
      expirationDate: exp,
      strike: atmStrike,
      callMid: Math.round(callMid * 100) / 100,
      putMid: Math.round(putMid * 100) / 100,
      straddle: Math.round(straddle * 100) / 100,
      expectedMove: Math.round(expectedMove * 100) / 100,
    });
  }

  if (results.length === 0) return null;

  results.sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
  return results;
}

/**
 * Fetch upcoming dividends for a ticker within a date range.
 * Returns array of { exDividendDate, payDate, cashAmount, frequency, dividendType }.
 */
async function fetchDividends(ticker, fromDate, toDate) {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    apiKey,
    ticker,
    'ex_dividend_date.gte': fromDate,
    'ex_dividend_date.lte': toDate,
    limit: '50',
    order: 'asc',
    sort: 'ex_dividend_date',
  });
  const url = `${API_BASE}/v3/reference/dividends?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).map(d => ({
    exDividendDate: d.ex_dividend_date,
    payDate: d.pay_date,
    cashAmount: d.cash_amount,
    frequency: d.frequency,
    dividendType: d.dividend_type,
  }));
}

/**
 * Fetch upcoming stock splits for a ticker within a date range.
 * Returns array of { executionDate, splitFrom, splitTo }.
 */
async function fetchSplits(ticker, fromDate, toDate) {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    apiKey,
    ticker,
    'execution_date.gte': fromDate,
    'execution_date.lte': toDate,
    limit: '50',
    order: 'asc',
    sort: 'execution_date',
  });
  const url = `${API_BASE}/v3/reference/splits?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  return (data.results || []).map(s => ({
    executionDate: s.execution_date,
    splitFrom: s.split_from,
    splitTo: s.split_to,
  }));
}

module.exports = { fetchDailyBars, fetchOptionsChain, extractAtmIV, extractAtmStraddle, fetchDividends, fetchSplits, sleep };
