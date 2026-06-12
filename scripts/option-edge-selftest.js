// scripts/option-edge-selftest.js
// Deterministic self-test for the option-edge math. No DB/network.
//   node scripts/option-edge-selftest.js

const { normCdf, blackScholes, impliedMove, simulateOtmBuy, aggregateBuys, moveComparison } = require('../src/optionEdgeMath');

let failures = 0;
function check(name, cond) {
  if (cond) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}`); failures++; }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log('normCdf:');
check('N(0)=0.5', near(normCdf(0), 0.5, 1e-6));
check('N(1.96)~0.975', near(normCdf(1.96), 0.975, 1e-3));
check('N(-1.96)~0.025', near(normCdf(-1.96), 0.025, 1e-3));

console.log('blackScholes:');
// ATM 1y 20% vol, r=0 → ~7.97 (known BSM value)
check('ATM call ~7.97', near(blackScholes(100, 100, 1, 0.2, 'call'), 7.97, 0.05));
check('ATM put == ATM call (r=0)', near(blackScholes(100, 100, 1, 0.2, 'put'), blackScholes(100, 100, 1, 0.2, 'call'), 1e-6));
check('deep OTM call is cheap', blackScholes(100, 200, 0.1, 0.5, 'call') < 0.5);
check('expiry intrinsic (t=0)', blackScholes(120, 100, 0, 0.5, 'call') === 20);

console.log('impliedMove:');
// 100 spot, 50% IV, 20 trading days → 100*0.5*sqrt(20/252) ≈ 14.08
check('implied move ~14.1', near(impliedMove(100, 0.5, 20), 14.08, 0.1));

console.log('simulateOtmBuy:');
{
  // Big up move: spot 100→160, 1σ OTM call. Should be a large multiple.
  const win = simulateOtmBuy({ spotEntry: 100, spotExit: 160, ivEntry: 0.5, days: 20, otmSigma: 1, type: 'call' });
  check('winner has positive payoff', win.payoff > 0 && win.ret > 0);
  check('winner is a multi-bagger', win.ret > 2);
  // No move: spot flat → OTM call expires worthless → ret = -1 (-100%)
  const lose = simulateOtmBuy({ spotEntry: 100, spotExit: 100, ivEntry: 0.5, days: 20, otmSigma: 1, type: 'call' });
  check('flat tape → total loss (-100%)', near(lose.ret, -1, 1e-9));
}

console.log('moveComparison:');
{
  const c = moveComparison(100, 130, 0.5, 20); // implied ~14, realized 30
  check('realized 30 > implied ~14 → exceeded', c.exceeded === true && c.realSigned === 30);
  const c2 = moveComparison(100, 105, 0.5, 20); // realized 5 < implied ~14
  check('realized 5 < implied → not exceeded', c2.exceeded === false);
}

console.log('aggregateBuys:');
{
  const samples = [{ ret: 9 }, { ret: -1 }, { ret: -1 }, { ret: -1 }, { ret: 2 }]; // one 10x, one 3x, three zeros
  const a = aggregateBuys(samples);
  check('n counted', a.n === 5);
  check('winRate 2/5 = 40%', a.winRate === 40);
  check('p10x = 1/5 = 20%', a.p10x === 20);
  check('p3x = 2/5 = 40% (>=2)', a.p3x === 40);
  check('avgRet = mean*100 = 160%', a.avgRet === 160); // (9-1-1-1+2)/5 = 1.6
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
