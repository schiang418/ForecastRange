// src/optionEdgeMath.js
// Pure (no DB/network) math for the "is buying options on this stock worth it?"
// backtest. Answers one question per the YOLO-buy thesis:
//
//   Do these stocks move MORE than their options were pricing in? If yes, buying
//   cheap OTM options pays; if the move ≈ what's implied, it's a losing game.
//
// We don't have stored historical option prices, so option premiums are
// approximated with Black-Scholes from the stored ATM IV (iv_history) — good
// enough to test the EDGE (realized move vs implied move) and the rough payoff
// of a lottery OTM buy. Kept separate so it can be unit-tested standalone.

// Standard normal CDF (Abramowitz & Stegun 7.1.26 approximation).
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

// Black-Scholes price (r=0, no dividends). type 'call' | 'put'.
function blackScholes(spot, strike, tYears, ivAnnual, type = 'call') {
  if (tYears <= 0 || ivAnnual <= 0) {
    const intrinsic = type === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    return intrinsic;
  }
  const vol = ivAnnual * Math.sqrt(tYears);
  const d1 = (Math.log(spot / strike) + 0.5 * vol * vol) / vol;
  const d2 = d1 - vol;
  if (type === 'call') return spot * normCdf(d1) - strike * normCdf(d2);
  return strike * normCdf(-d2) - spot * normCdf(-d1);
}

// Option-implied 1-sigma move over `days` trading days, from annualized IV.
function impliedMove(spot, ivAnnual, days) {
  return spot * ivAnnual * Math.sqrt(days / 252);
}

/**
 * Simulate ONE lottery OTM option buy, held to the horizon (intrinsic at exit).
 * @param {Object} p
 *   spotEntry, spotExit  - underlying price at entry and at horizon
 *   ivEntry              - annualized ATM IV at entry (for pricing the premium)
 *   days                 - horizon in trading days
 *   otmSigma             - strike placed this many implied-sigmas OTM (e.g. 1.0)
 *   type                 - 'call' | 'put'
 * @returns {{entry, strike, payoff, ret}} ret = payoff/entry - 1 (e.g. 9 = 10x)
 */
function simulateOtmBuy({ spotEntry, spotExit, ivEntry, days, otmSigma = 1.0, type = 'call' }) {
  const im = impliedMove(spotEntry, ivEntry, days);
  const strike = type === 'call' ? spotEntry + otmSigma * im : spotEntry - otmSigma * im;
  const entry = blackScholes(spotEntry, strike, days / 252, ivEntry, type);
  const payoff = type === 'call' ? Math.max(spotExit - strike, 0) : Math.max(strike - spotExit, 0);
  const ret = entry > 1e-6 ? payoff / entry - 1 : null; // skip un-priceable lottery tickets
  return { entry, strike, payoff, ret };
}

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }
const pct = (n, d) => (d ? Number(((n / d) * 100).toFixed(1)) : null);

/**
 * Aggregate option-buy samples into the numbers that decide go/no-go.
 * Each sample = a simulateOtmBuy() result. Treats every bet as an equal stake
 * (the lottery-portfolio model): mean return IS the portfolio return.
 */
function aggregateBuys(samples) {
  const rets = samples.map((s) => s.ret).filter((r) => r != null);
  if (!rets.length) return { n: 0 };
  return {
    n: rets.length,
    winRate: pct(rets.filter((r) => r > 0).length, rets.length),     // finished ITM
    avgRet: Number((mean(rets) * 100).toFixed(1)),                    // portfolio return %
    medianRet: Number((median(rets) * 100).toFixed(1)),
    p3x: pct(rets.filter((r) => r >= 2).length, rets.length),         // 3x+ winners
    p10x: pct(rets.filter((r) => r >= 9).length, rets.length),        // 10x+ winners
  };
}

/**
 * Compare realized vs implied move for one entry — the precondition test.
 * @returns {{impMove, realAbs, realSigned, exceeded}}
 */
function moveComparison(spotEntry, spotExit, ivEntry, days) {
  const impMove = impliedMove(spotEntry, ivEntry, days);
  const realSigned = spotExit - spotEntry;
  const realAbs = Math.abs(realSigned);
  return { impMove, realAbs, realSigned, exceeded: realAbs > impMove };
}

module.exports = {
  normCdf, blackScholes, impliedMove, simulateOtmBuy, aggregateBuys, moveComparison,
};
