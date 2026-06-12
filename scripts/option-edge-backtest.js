// scripts/option-edge-backtest.js
// THE go/no-go test for the weekly YOLO option-buying sleeve.
//
// Question 1 (precondition): do these stocks move MORE than their options imply?
// Question 2 (payoff): would buying a 1-sigma OTM option each week have paid —
//   for all weeks, for the trend direction, and only when options looked CHEAP
//   (IV < recent realized vol)?
//
// Premiums are approximated with Black-Scholes from stored ATM IV (iv_history),
// since historical option prices aren't saved. Price comes from Polygon.
//
// Env: DATABASE_URL (ForecastRange DB, for iv_history) + MASSIVE_STOCK_API_KEY (Polygon).
//   node scripts/option-edge-backtest.js                 # default vol names
//   node scripts/option-edge-backtest.js SNDK MU TSLA    # custom list

const { fetchDailyBars } = require('../src/polygon');
const { getIVHistory } = require('../server/ivHistory');
const { simulateOtmBuy, aggregateBuys, moveComparison } = require('../src/optionEdgeMath');

const HORIZONS = [5, 10, 15];           // 1W / 2W / 3W (trading days)
const STEP = 5;                          // sample weekly (avoid overlapping daily windows)
const OTM_SIGMA = 1.0;                   // strike 1 implied-sigma OTM
const DEFAULT_TICKERS = ['SNDK', 'MU', 'TSLA', 'COIN', 'MSTR'];

function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

// trailing 20-day annualized realized vol from closes ending at index i
function realizedVol(closes, i, win = 20) {
  if (i < win) return null;
  const r = [];
  for (let j = i - win + 1; j <= i; j++) r.push(Math.log(closes[j] / closes[j - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v) * Math.sqrt(252);
}

async function runTicker(ticker) {
  const bars = await fetchDailyBars(ticker, isoDaysAgo(900), isoDaysAgo(0));
  if (!bars || bars.length < 60) { console.log(`\n${ticker}: not enough price history`); return; }
  const ivRows = await getIVHistory(ticker, 1000);
  const ivByDate = new Map(ivRows.map((r) => [r.date, r.iv]));

  // align: keep bars that have an IV reading
  const rows = bars
    .map((b) => ({ date: (b.date || b.t || '').slice(0, 10), close: b.c ?? b.close }))
    .filter((r) => r.close != null && ivByDate.has(r.date))
    .map((r) => ({ ...r, iv: ivByDate.get(r.date) }));
  const closes = rows.map((r) => r.close);

  if (rows.length < 40) {
    console.log(`\n${ticker}: only ${rows.length} bars have IV — too few (iv_history sparse). Backfill IV first.`);
    return;
  }

  console.log(`\n=== ${ticker} === (${rows.length} bars with IV, ${bars.length} price bars)`);
  for (const H of HORIZONS) {
    let exceeded = 0, total = 0;
    const all = [], directional = [], cheap = [];
    for (let i = 20; i + H < rows.length; i += STEP) {
      const e = rows[i], x = rows[i + H];
      const cmp = moveComparison(e.close, x.close, e.iv, H);
      exceeded += cmp.exceeded ? 1 : 0; total++;

      const mom = e.close - rows[i - 20].close;          // 20-day momentum (direction proxy)
      const dirType = mom >= 0 ? 'call' : 'put';
      const rv = realizedVol(closes, i);
      const isCheap = rv != null && e.iv < rv;            // options imply less than recent realized

      const callBuy = simulateOtmBuy({ spotEntry: e.close, spotExit: x.close, ivEntry: e.iv, days: H, otmSigma: OTM_SIGMA, type: 'call' });
      const dirBuy = simulateOtmBuy({ spotEntry: e.close, spotExit: x.close, ivEntry: e.iv, days: H, otmSigma: OTM_SIGMA, type: dirType });
      all.push(callBuy);
      directional.push(dirBuy);
      if (isCheap) cheap.push(dirBuy);
    }
    const A = aggregateBuys(all), D = aggregateBuys(directional), C = aggregateBuys(cheap);
    const exRate = total ? ((exceeded / total) * 100).toFixed(0) : '--';
    const fmt = (s) => s.n ? `n=${String(s.n).padStart(3)} win=${s.winRate}% avg=${s.avgRet}% 3x=${s.p3x}% 10x=${s.p10x}%` : 'n=0';
    console.log(`  h=${String(H).padStart(2)}d  realized>implied: ${exRate}% of weeks`);
    console.log(`        buy calls (all weeks): ${fmt(A)}`);
    console.log(`        buy trend direction  : ${fmt(D)}`);
    console.log(`        + only when IV<RV    : ${fmt(C)}`);
  }
}

(async () => {
  const tickers = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TICKERS;
  console.log(`Option-buy edge test — ${tickers.join(', ')} | ${OTM_SIGMA}σ OTM, held to horizon, BSM-priced from stored IV`);
  console.log('avg% = equal-stake portfolio return (so it nets the many -100% losers against the rare 10x).');
  for (const t of tickers) {
    try { await runTicker(t.toUpperCase()); }
    catch (err) { console.error(`\n${t}: ${err.message}`); }
  }
  console.log('\nRead: GO if "buy trend direction" (esp. "IV<RV") shows POSITIVE avg% with a healthy 10x rate.');
  console.log('NO-GO if avg% is negative — the stock does NOT move more than implied, so buying options bleeds.');
  process.exit(0);
})();
