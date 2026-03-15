import { ForecastResult, ForecastHorizon } from './api';

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function sign(v: number): string {
  return v > 0 ? '+' : '';
}

function blendKeyLabel(h: ForecastHorizon, key: string): string {
  if (key === 'options') return h.optionsSource === 'straddle' ? 'STRADDLE' : 'IV';
  return key.toUpperCase();
}

function blendKeyMove(h: ForecastHorizon, key: string): number {
  if (key === 'options') return (h.optionsSource === 'straddle' ? h.components.straddleMove : h.components.ivMove) ?? 0;
  if (key === 'atr') return h.components.atrMove;
  if (key === 'rv') return h.components.rvMove;
  if (key === 'structure') return h.components.structureMove;
  return 0;
}

function horizonSection(h: ForecastHorizon, result: ForecastResult): string {
  const spot = result.spot;
  const ind = result.indicators;
  const lines: string[] = [];

  const label = h.targetDate ? `${fmtDate(h.targetDate)} (${h.horizonDays} trading days)` : h.horizon;
  lines.push(`## Horizon: ${label}`);
  lines.push('');

  // Volatility components
  lines.push('### Step 1: Volatility Components');
  lines.push('');
  lines.push('```');
  lines.push(`ATR(14) move = ATR14 × sqrt(horizonDays)`);
  lines.push(`             = $${ind.atr14.toFixed(2)} × sqrt(${h.horizonDays})`);
  lines.push(`             = $${ind.atr14.toFixed(2)} × ${Math.sqrt(h.horizonDays).toFixed(4)}`);
  lines.push(`             = $${h.components.atrMove.toFixed(2)}`);
  lines.push('');
  lines.push(`RV(20d) move = spot × dailySigma × sqrt(horizonDays)`);
  lines.push(`             = $${spot.toFixed(2)} × ${(ind.rv20Daily * 100).toFixed(4)}% × sqrt(${h.horizonDays})`);
  lines.push(`             = $${spot.toFixed(2)} × ${ind.rv20Daily.toFixed(6)} × ${Math.sqrt(h.horizonDays).toFixed(4)}`);
  lines.push(`             = $${h.components.rvMove.toFixed(2)}`);
  if (h.components.ivMove != null && h.ivUsed != null) {
    lines.push('');
    lines.push(`IV move      = spot × IV × sqrt(horizonDays / 252)`);
    lines.push(`             = $${spot.toFixed(2)} × ${(h.ivUsed * 100).toFixed(2)}% × sqrt(${h.horizonDays} / 252)`);
    lines.push(`             = $${spot.toFixed(2)} × ${h.ivUsed.toFixed(6)} × ${Math.sqrt(h.horizonDays / 252).toFixed(6)}`);
    lines.push(`             = $${h.components.ivMove.toFixed(2)}`);
    if (h.ivTermStructure?.interpolated) {
      lines.push('');
      lines.push(`  IV term structure interpolation:`);
      lines.push(`    before: ${h.ivTermStructure.beforeExp} (IV=${((h.ivTermStructure.beforeIV ?? 0) * 100).toFixed(1)}%)`);
      lines.push(`    after:  ${h.ivTermStructure.afterExp} (IV=${((h.ivTermStructure.afterIV ?? 0) * 100).toFixed(1)}%)`);
      lines.push(`    t = ${h.ivTermStructure.t}  →  interpolated IV = ${(h.ivUsed * 100).toFixed(2)}%`);
    }
  }
  lines.push('```');
  lines.push('');

  // Straddle expected move
  if (h.components.straddleMove != null && h.straddleInfo) {
    lines.push('### Step 1b: Straddle Expected Move (Market-Implied)');
    lines.push('');
    lines.push('```');
    if (h.straddleInfo.callMid != null && h.straddleInfo.putMid != null) {
      lines.push(`ATM strike     = $${h.straddleInfo.strike?.toFixed(2)}`);
      lines.push(`Call mid       = $${h.straddleInfo.callMid.toFixed(2)}`);
      lines.push(`Put mid        = $${h.straddleInfo.putMid.toFixed(2)}`);
      lines.push(`Straddle       = $${h.straddleInfo.callMid.toFixed(2)} + $${h.straddleInfo.putMid.toFixed(2)} = $${h.straddleInfo.straddle?.toFixed(2)}`);
      lines.push(`Expected move  = 0.85 × $${h.straddleInfo.straddle?.toFixed(2)} = $${h.components.straddleMove.toFixed(2)}`);
    } else {
      lines.push(`Expected move  = $${h.components.straddleMove.toFixed(2)}`);
    }
    lines.push(`Source         = ${h.straddleInfo.source}`);
    lines.push(`Expiration     = ${h.straddleInfo.expiration}`);
    if (h.straddleInfo.scaleFactor != null) {
      lines.push(`Scale factor   = ${h.straddleInfo.scaleFactor} (sqrt-time scaling to target horizon)`);
    }
    if (h.optionsSource === 'straddle') {
      lines.push('');
      lines.push(`→ Using straddle (market-implied) instead of IV×sqrt(t) for options blend component`);
    }
    lines.push('```');
    lines.push('');
  }

  // S/R Structure
  lines.push('### Step 1c: Support/Resistance Structure');
  lines.push('');
  lines.push('```');
  lines.push(`Lookback: ${h.structureData.lookbackDays} bars`);
  if (h.structureData.resistance) {
    lines.push(`Resistance: $${h.structureData.resistance.price.toFixed(2)} (${h.structureData.resistance.type}${h.structureData.resistance.date ? ', ' + h.structureData.resistance.date : ''})`);
    lines.push(`  distance: $${h.structureData.distToResistance?.toFixed(2)}`);
  } else {
    lines.push(`Resistance: none detected in lookback window`);
  }
  if (h.structureData.support) {
    lines.push(`Support:    $${h.structureData.support.price.toFixed(2)} (${h.structureData.support.type}${h.structureData.support.date ? ', ' + h.structureData.support.date : ''})`);
    lines.push(`  distance: $${h.structureData.distToSupport?.toFixed(2)}`);
  } else {
    lines.push(`Support:    none detected in lookback window`);
  }
  lines.push(`Structure move = avg(distToSupport, distToResistance) = $${h.components.structureMove.toFixed(2)}`);
  lines.push('```');
  if (h.structureData.levels.length > 0) {
    lines.push('');
    lines.push('All detected levels:');
    lines.push('');
    for (const l of h.structureData.levels) {
      lines.push(`- ${l.side === 'resistance' ? '▲' : '▼'} $${l.price.toFixed(2)} (${l.type}${l.date ? ', ' + l.date : ''})`);
    }
  }
  lines.push('');

  // Blending
  lines.push('### Step 2: Blending');
  lines.push('');
  lines.push(`Formula: \`${h.blending.formula}\``);
  lines.push('');
  lines.push('```');
  const parts: string[] = [];
  for (const [key, contribution] of Object.entries(h.blending.contributions)) {
    const weight = h.blending.weights[key];
    const rawMove = blendKeyMove(h, key);
    parts.push(`  ${blendKeyLabel(h, key).padEnd(10)} ${(weight * 100).toFixed(0).padStart(3)}% × $${rawMove.toFixed(2).padStart(8)} = $${contribution.toFixed(2)}`);
  }
  lines.push(...parts);
  lines.push(`  ${''.padEnd(10)} ${''.padStart(3)}   ${''.padStart(8)}   --------`);
  lines.push(`  ${'TOTAL'.padEnd(10)} ${''.padStart(3)}   ${''.padStart(8)}   $${h.expectedMove.toFixed(2)} (${h.expectedMovePct.toFixed(2)}% of spot)`);
  lines.push('```');
  lines.push('');

  // Trend drift
  lines.push('### Step 3: Trend Drift');
  lines.push('');
  lines.push('```');
  lines.push(`Drift = spot × k × trendScore × sqrt(horizonDays / 5)`);
  lines.push(`      = $${spot.toFixed(2)} × ${h.trendDriftCalc.values.k} × ${sign(h.trendDriftCalc.values.trendScore)}${h.trendDriftCalc.values.trendScore.toFixed(4)} × sqrt(${h.horizonDays}/5)`);
  lines.push(`      = $${spot.toFixed(2)} × ${h.trendDriftCalc.values.k} × ${sign(h.trendDriftCalc.values.trendScore)}${h.trendDriftCalc.values.trendScore.toFixed(4)} × ${h.trendDriftCalc.values.sqrtFactor.toFixed(4)}`);
  lines.push(`      = ${sign(h.trendDriftCalc.result)}$${h.trendDriftCalc.result.toFixed(2)}`);
  lines.push('');
  lines.push(`Center = spot + drift = $${spot.toFixed(2)} + ${sign(h.trendDriftCalc.result)}$${h.trendDriftCalc.result.toFixed(2)} = $${h.bandCalc.centerUsed.toFixed(2)}`);
  lines.push('```');
  lines.push('');

  // Bands
  lines.push('### Step 4: Price Range Bands');
  lines.push('');
  lines.push('```');
  lines.push(`Band formula: center ± sigma × blendedMove`);
  lines.push(`              $${h.bandCalc.centerUsed.toFixed(2)} ± sigma × $${h.bandCalc.moveUsed.toFixed(2)}`);
  lines.push('');
  lines.push(`50% band (${h.bandCalc.sigmaMultipliers.band50}σ):  $${h.range50.low.toFixed(2)} — $${h.range50.high.toFixed(2)}`);
  lines.push(`68% band (${h.bandCalc.sigmaMultipliers.band68}σ):  $${h.range68.low.toFixed(2)} — $${h.range68.high.toFixed(2)}`);
  lines.push(`90% band (${h.bandCalc.sigmaMultipliers.band90}σ):  $${h.range90.low.toFixed(2)} — $${h.range90.high.toFixed(2)}  (fat-tail adjusted)`);
  lines.push('```');
  lines.push('');

  // Confidence
  lines.push('### Step 5: Confidence Score');
  lines.push('');
  const confLabels: Record<string, string> = {
    volAgreement: 'ATR/RV Agreement',
    ivAgreement: 'Options Agreement',
    trendClarity: 'Trend Clarity',
  };
  lines.push('```');
  for (const [key, comp] of Object.entries(h.confidenceBreakdown)) {
    const name = confLabels[key] || key;
    lines.push(`  ${name.padEnd(20)} value=${(comp.value * 100).toFixed(1)}%  weight=${(comp.weight * 100).toFixed(0)}%  contribution=${(comp.value * comp.weight * 100).toFixed(1)}%`);
  }
  lines.push(`  ${''.padEnd(20)} ${''.padEnd(40)} -----------`);
  lines.push(`  ${'TOTAL'.padEnd(20)} ${''.padEnd(40)} ${(h.confidence * 100).toFixed(1)}% (${h.confidenceLabel})`);
  lines.push('```');
  lines.push('');

  // Summary
  lines.push(`### Summary`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Expected Move | $${h.expectedMove.toFixed(2)} (${h.expectedMovePct.toFixed(2)}%) |`);
  lines.push(`| Center | $${h.bandCalc.centerUsed.toFixed(2)} |`);
  lines.push(`| 50% Range | $${h.range50.low.toFixed(2)} — $${h.range50.high.toFixed(2)} |`);
  lines.push(`| 68% Range | $${h.range68.low.toFixed(2)} — $${h.range68.high.toFixed(2)} |`);
  lines.push(`| 90% Range | $${h.range90.low.toFixed(2)} — $${h.range90.high.toFixed(2)} |`);
  lines.push(`| Skew | ${h.skew} |`);
  lines.push(`| Confidence | ${(h.confidence * 100).toFixed(0)}% (${h.confidenceLabel}) |`);
  lines.push(`| Options Source | ${h.optionsSource ?? 'none'} |`);
  lines.push(`| IV Used | ${h.ivAvailable ? 'Yes' : 'No'}${h.ivUsed != null ? ` (${(h.ivUsed * 100).toFixed(2)}%)` : ''} |`);
  lines.push(`| Straddle Move | ${h.components.straddleMove != null ? '$' + h.components.straddleMove.toFixed(2) : 'N/A'} |`);
  lines.push(`| Structure Move | $${h.components.structureMove.toFixed(2)} |`);
  lines.push(`| Support | ${h.structureData.support ? '$' + h.structureData.support.price.toFixed(2) : 'N/A'} |`);
  lines.push(`| Resistance | ${h.structureData.resistance ? '$' + h.structureData.resistance.price.toFixed(2) : 'N/A'} |`);
  lines.push('');

  return lines.join('\n');
}

export function generateForecastMarkdown(result: ForecastResult): string {
  const lines: string[] = [];
  const tb = result.trendBreakdown;

  lines.push(`# ${result.ticker} Forecast — Detailed Calculations`);
  lines.push('');
  lines.push(`Generated: ${new Date(result.generatedAt).toLocaleString()}`);
  lines.push('');

  // Input data
  lines.push('## Input Data');
  lines.push('');
  lines.push(`| Parameter | Value |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| Spot Price | $${result.spot.toFixed(2)} |`);
  lines.push(`| Data Points | ${result.dataPoints} bars |`);
  lines.push(`| EMA(20) | $${result.indicators.ema20.toFixed(2)} |`);
  lines.push(`| SMA(50) | $${result.indicators.sma50.toFixed(2)} |`);
  lines.push(`| RSI(14) | ${result.indicators.rsi14.toFixed(2)} |`);
  lines.push(`| ATR(14) | $${result.indicators.atr14.toFixed(2)} |`);
  lines.push(`| RV(20d) daily sigma | ${(result.indicators.rv20Daily * 100).toFixed(4)}% |`);
  lines.push(`| IV Available | ${result.ivAvailable ? `Yes (${result.ivExpirations} expirations)` : 'No'} |`);
  lines.push(`| Straddle Available | ${result.straddleAvailable ? `Yes (${result.straddleExpirations} expirations)` : 'No'} |`);
  if (result.indicators.ema20Slope != null)
    lines.push(`| EMA(20) Slope | ${sign(result.indicators.ema20Slope)}${result.indicators.ema20Slope.toFixed(4)} |`);
  if (result.indicators.ema50Slope != null)
    lines.push(`| EMA(50) Slope | ${sign(result.indicators.ema50Slope)}${result.indicators.ema50Slope.toFixed(4)} |`);
  if (result.indicators.macdHistogram != null)
    lines.push(`| MACD Histogram | ${sign(result.indicators.macdHistogram)}${result.indicators.macdHistogram.toFixed(4)} |`);
  if (result.indicators.bollingerBandwidth != null)
    lines.push(`| Bollinger Bandwidth | ${result.indicators.bollingerBandwidth.toFixed(4)} |`);
  lines.push('');

  // Volatility / Premium Quality
  const vm = result.volatilityMetrics;
  lines.push('## Volatility / Premium Quality');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Current IV | ${vm.currentIVPct != null ? vm.currentIVPct.toFixed(1) + '%' : 'N/A'} |`);
  lines.push(`| RV(20d) Annualized | ${vm.rv20AnnualizedPct.toFixed(1)}% |`);
  lines.push(`| IV / RV Ratio | ${vm.ivRvRatio != null ? vm.ivRvRatio.toFixed(2) + 'x' : 'N/A'} |`);
  lines.push(`| Vol Premium | ${vm.volPremium != null ? (vm.volPremium > 0 ? '+' : '') + vm.volPremium.toFixed(1) + 'pp' : 'N/A'} |`);
  const ivPctDays = vm.ivPercentileSource === 'iv_history' ? vm.ivHistoryDays : vm.rvHistoryDays;
  const ivPctNote = vm.ivPercentileSource === 'rv_approximation' ? ' (RV approx)' : '';
  lines.push(`| IV Percentile (${ivPctDays}d)${ivPctNote} | ${vm.ivPercentile != null ? vm.ivPercentile + '%' : 'N/A'} |`);
  lines.push(`| IV Rank (${ivPctDays}d)${ivPctNote} | ${vm.ivRank != null ? vm.ivRank + '%' : 'N/A'} |`);
  lines.push(`| IV Percentile Source | ${vm.ivPercentileSource === 'iv_history' ? `IV history (${vm.ivHistoryDays} days)` : `RV approximation (${vm.ivHistoryDays} IV snapshots)`} |`);
  lines.push(`| RV Percentile (${vm.rvHistoryDays}d) | ${vm.rvPercentile != null ? vm.rvPercentile + '%' : 'N/A'} |`);
  lines.push(`| RV Rank (${vm.rvHistoryDays}d) | ${vm.rvRank != null ? vm.rvRank + '%' : 'N/A'} |`);
  lines.push(`| Volatility Regime | ${vm.regime} |`);
  lines.push(`| Premium Quality Score | ${vm.premiumScore != null ? vm.premiumScore + '/100' : 'N/A'} |`);
  lines.push(`| Premium Label | ${vm.premiumLabel ?? 'N/A'} |`);
  if (vm.rvHistoryRange) {
    lines.push(`| RV Range (${vm.rvHistoryDays}d) | ${vm.rvHistoryRange.min.toFixed(1)}% — ${vm.rvHistoryRange.max.toFixed(1)}% (median ${vm.rvHistoryRange.median.toFixed(1)}%) |`);
  }
  if (vm.ivHistoryRange) {
    lines.push(`| IV Range (${vm.ivHistoryDays}d) | ${vm.ivHistoryRange.min.toFixed(1)}% — ${vm.ivHistoryRange.max.toFixed(1)}% (median ${vm.ivHistoryRange.median.toFixed(1)}%) |`);
  }
  lines.push('');

  // Premium Quality interpretation
  lines.push('**Interpretation:**');
  lines.push('');
  if (vm.premiumLabel === 'rich') {
    lines.push('- IV is elevated relative to realized vol — premium selling is attractive');
  } else if (vm.premiumLabel === 'moderately attractive') {
    lines.push('- IV is moderately above realized vol — premium selling has a modest edge');
  } else if (vm.premiumLabel === 'neutral') {
    lines.push('- IV and realized vol are roughly in line — no strong edge for sellers');
  } else if (vm.premiumLabel === 'cheap') {
    lines.push('- IV is low relative to realized vol — premium is not attractive for selling');
  } else {
    lines.push('- No IV data available — premium quality cannot be assessed');
  }
  lines.push('');

  // Volatility panel calculation details
  lines.push('**Calculation details:**');
  lines.push('');
  lines.push('```');
  lines.push(`RV(20d) annualized = daily_sigma × sqrt(252)`);
  lines.push(`                   = ${(result.indicators.rv20Daily * 100).toFixed(4)}% × ${Math.sqrt(252).toFixed(4)}`);
  lines.push(`                   = ${vm.rv20AnnualizedPct.toFixed(1)}%`);
  if (vm.currentIVPct != null && vm.ivRvRatio != null) {
    lines.push('');
    lines.push(`IV/RV ratio        = ${vm.currentIVPct.toFixed(1)}% / ${vm.rv20AnnualizedPct.toFixed(1)}% = ${vm.ivRvRatio.toFixed(2)}x`);
    lines.push(`Vol premium        = ${vm.currentIVPct.toFixed(1)}% - ${vm.rv20AnnualizedPct.toFixed(1)}% = ${vm.volPremium! > 0 ? '+' : ''}${vm.volPremium!.toFixed(1)}pp`);
  }
  if (vm.ivPercentile != null) {
    lines.push('');
    if (vm.ivPercentileSource === 'iv_history') {
      lines.push(`IV percentile      = % of ${vm.ivHistoryDays}d IV history below current IV`);
      lines.push(`                   = ${vm.ivPercentile}% (current IV > ${vm.ivPercentile}% of historical IV values)`);
      lines.push(`                   [source: true IV history from daily snapshots]`);
    } else {
      lines.push(`IV percentile      = % of ${vm.rvHistoryDays}d RV history below current IV (approximation)`);
      lines.push(`                   = ${vm.ivPercentile}% (current IV > ${vm.ivPercentile}% of historical RV values)`);
      lines.push(`                   [source: RV approximation — IV history: ${vm.ivHistoryDays}/30 snapshots]`);
    }
  }
  if (vm.premiumScore != null) {
    lines.push('');
    lines.push(`Premium score      = 0.45 × ivPercentile + 0.35 × normalized(IV/RV) + 0.20 × ivTrend`);
    lines.push(`                   = ${vm.premiumScore}/100 → "${vm.premiumLabel}"`);
  }
  lines.push('```');
  lines.push('');

  // IV Debug Diagnostics
  if (vm.ivDebug) {
    lines.push('### IV History Debug Diagnostics');
    lines.push('');
    lines.push('```');
    lines.push(`Total IV history rows: ${vm.ivDebug.totalRows}`);
    lines.push(`Current IV:            ${vm.ivDebug.currentIV != null ? (vm.ivDebug.currentIV * 100).toFixed(1) + '%' : 'N/A'}`);
    lines.push(`Below count:           ${vm.ivDebug.belowCount}/${vm.ivDebug.totalRows}`);
    lines.push(`IV Percentile calc:    ${vm.ivDebug.ivPercentileCalc}`);
    lines.push(`IV Rank calc:          ${vm.ivDebug.ivRankCalc}`);
    lines.push('');
    lines.push('IV Distribution (historical):');
    lines.push(`  P10 = ${vm.ivDebug.distribution.p10}%`);
    lines.push(`  P25 = ${vm.ivDebug.distribution.p25}%`);
    lines.push(`  P50 = ${vm.ivDebug.distribution.p50}% (median)`);
    lines.push(`  P75 = ${vm.ivDebug.distribution.p75}%`);
    lines.push(`  P90 = ${vm.ivDebug.distribution.p90}%`);
    lines.push('');
    lines.push('Recent IV history entries:');
    for (const e of vm.ivDebug.recentEntries) {
      lines.push(`  ${e.date}: ${e.iv.toFixed(1)}%`);
    }
    lines.push('```');
    lines.push('');
  }

  // IV Term Structure
  if (result.ivTermStructure && result.ivTermStructure.length > 0) {
    lines.push('## IV Term Structure');
    lines.push('');
    lines.push('| Expiration | IV | Contracts |');
    lines.push('|------------|----|-----------| ');
    for (const e of result.ivTermStructure) {
      lines.push(`| ${e.expirationDate} | ${(e.iv * 100).toFixed(1)}% | ${e.contractsUsed} |`);
    }
    lines.push('');
  }

  // Straddle Term Structure
  if (result.straddleTermStructure && result.straddleTermStructure.length > 0) {
    lines.push('## Straddle Term Structure');
    lines.push('');
    lines.push('| Expiration | ATM Strike | Call Mid | Put Mid | Straddle | Expected Move |');
    lines.push('|------------|-----------|---------|---------|----------|---------------|');
    for (const s of result.straddleTermStructure) {
      lines.push(`| ${s.expirationDate} | $${s.strike.toFixed(0)} | $${s.callMid.toFixed(2)} | $${s.putMid.toFixed(2)} | $${s.straddle.toFixed(2)} | $${s.expectedMove.toFixed(2)} |`);
    }
    lines.push('');
  }

  // Trend score breakdown
  lines.push('## Trend Score Breakdown');
  lines.push('');
  lines.push('Formula: `0.35 × EMA20 + 0.25 × EMA50 + 0.20 × MACD + 0.20 × RSI`');
  lines.push('');
  lines.push('```');
  const components = [
    { name: 'EMA20 Slope', data: tb.ema20Slope, unit: '%' },
    { name: 'EMA50 Slope', data: tb.ema50Slope, unit: '%' },
    { name: 'MACD Hist', data: tb.macdHistogram, unit: '%' },
    { name: 'RSI Regime', data: tb.rsiRegime, unit: '' },
  ];
  lines.push(`${'Component'.padEnd(15)} ${'Weight'.padStart(6)} ${'Raw'.padStart(10)} ${'Normalized'.padStart(10)} ${'Contribution'.padStart(12)}`);
  lines.push(`${'—'.repeat(15)} ${'—'.repeat(6)} ${'—'.repeat(10)} ${'—'.repeat(10)} ${'—'.repeat(12)}`);
  for (const { name, data, unit } of components) {
    const rawStr = data.raw != null ? `${sign(data.raw)}${data.raw.toFixed(2)}${unit}` : 'N/A';
    const normStr = `${sign(data.normalized)}${data.normalized.toFixed(4)}`;
    const contrib = data.weight * data.normalized;
    const contribStr = `${sign(contrib)}${contrib.toFixed(4)}`;
    lines.push(`${name.padEnd(15)} ${((data.weight * 100).toFixed(0) + '%').padStart(6)} ${rawStr.padStart(10)} ${normStr.padStart(10)} ${contribStr.padStart(12)}`);
  }
  lines.push(`${'—'.repeat(15)} ${'—'.repeat(6)} ${'—'.repeat(10)} ${'—'.repeat(10)} ${'—'.repeat(12)}`);
  lines.push(`${'TOTAL'.padEnd(15)} ${''.padStart(6)} ${''.padStart(10)} ${''.padStart(10)} ${(sign(result.trendScore) + result.trendScore.toFixed(4)).padStart(12)}`);
  lines.push('```');
  lines.push('');

  // Each horizon
  for (const h of result.horizons) {
    lines.push('---');
    lines.push('');
    lines.push(horizonSection(h, result));
  }

  // Verification notes
  lines.push('---');
  lines.push('');
  lines.push('## Verification Notes');
  lines.push('');
  lines.push('To independently verify these calculations:');
  lines.push('');
  lines.push('1. **ATR move**: Multiply ATR(14) by `sqrt(trading_days)`');
  lines.push('2. **RV move**: Multiply `spot × daily_sigma × sqrt(trading_days)`');
  lines.push('3. **IV move**: Multiply `spot × annualized_IV × sqrt(trading_days / 252)`');
  lines.push('4. **Straddle move**: `0.85 × (ATM_call_mid + ATM_put_mid)`, sqrt-scaled across expirations');
  lines.push('5. **S/R structure move**: avg(distance to nearest support, distance to nearest resistance)');
  lines.push('6. **Blended move**: Apply the weight formula shown for each horizon');
  lines.push('7. **Trend drift**: `spot × 0.02 × trendScore × sqrt(trading_days / 5)`');
  lines.push('8. **Center**: `spot + drift`');
  lines.push('9. **Bands**: `center ± sigma_multiplier × blended_move`');
  lines.push('   - 50% band: σ = 0.67');
  lines.push('   - 68% band: σ = 1.00');
  lines.push('   - 90% band: σ = 1.80 (fat-tail adjusted from 1.64)');
  lines.push('');

  // Audit Reference section
  lines.push('---');
  lines.push('');
  lines.push('## Audit Reference');
  lines.push('');
  lines.push('This section documents the exact formulas and normalization rules used by the forecast engine,');
  lines.push('enabling independent verification of every intermediate value.');
  lines.push('');

  // 1. Trend Score Normalization Rules
  lines.push('### 1. Trend Score Normalization Rules');
  lines.push('');
  lines.push('Each raw indicator value is mapped to [-1, +1] using piecewise linear interpolation (`gradientScore`),');
  lines.push('clamped at boundary values.');
  lines.push('');
  lines.push('```');
  lines.push('gradientScore(value, breakpoints):');
  lines.push('  if value <= first breakpoint x → return first breakpoint y');
  lines.push('  if value >= last breakpoint x  → return last breakpoint y');
  lines.push('  otherwise: linear interpolation between bracketing breakpoints');
  lines.push('```');
  lines.push('');
  lines.push('| Component | Raw Input | Breakpoints (input → output) | Range |');
  lines.push('|-----------|-----------|------------------------------|-------|');
  lines.push('| EMA20 Slope | slope × 100 (%) | [-5% → -1], [0% → 0], [+5% → +1] | [-1, +1] |');
  lines.push('| EMA50 Slope | slope × 100 (%) | [-3% → -1], [0% → 0], [+3% → +1] | [-1, +1] |');
  lines.push('| MACD Histogram | (histogram/close) × 100 (%) | [-1% → -1], [0% → 0], [+1% → +1] | [-1, +1] |');
  lines.push('| RSI Regime | RSI(14) raw value | [20 → -1], [30 → -0.5], [50 → 0], [70 → +0.5], [80 → +1] | [-1, +1] |');
  lines.push('');

  // Show actual normalization derivations
  lines.push('**Actual normalization derivations for this forecast:**');
  lines.push('');
  lines.push('```');
  const ema20Raw = tb.ema20Slope.raw;
  const ema50Raw = tb.ema50Slope.raw;
  const macdRaw = tb.macdHistogram.raw;
  const rsiRaw = tb.rsiRegime.raw;
  if (ema20Raw != null) {
    lines.push(`EMA20 Slope: raw = ${sign(ema20Raw)}${ema20Raw.toFixed(4)}%`);
    lines.push(`  breakpoints: [-5→-1, 0→0, 5→+1]`);
    if (ema20Raw >= 0) {
      lines.push(`  segment [0→0, 5→+1]: t = ${ema20Raw.toFixed(4)} / 5 = ${(ema20Raw / 5).toFixed(4)}`);
      lines.push(`  normalized = 0 + ${(ema20Raw / 5).toFixed(4)} × (1 - 0) = ${sign(tb.ema20Slope.normalized)}${tb.ema20Slope.normalized.toFixed(4)}`);
    } else {
      lines.push(`  segment [-5→-1, 0→0]: t = (${ema20Raw.toFixed(4)} - (-5)) / 5 = ${((ema20Raw + 5) / 5).toFixed(4)}`);
      lines.push(`  normalized = -1 + ${((ema20Raw + 5) / 5).toFixed(4)} × (0 - (-1)) = ${sign(tb.ema20Slope.normalized)}${tb.ema20Slope.normalized.toFixed(4)}`);
    }
    lines.push('');
  }
  if (ema50Raw != null) {
    lines.push(`EMA50 Slope: raw = ${sign(ema50Raw)}${ema50Raw.toFixed(4)}%`);
    lines.push(`  breakpoints: [-3→-1, 0→0, 3→+1]`);
    if (ema50Raw >= 3) {
      lines.push(`  clamped at +1 (raw >= 3)`);
    } else if (ema50Raw <= -3) {
      lines.push(`  clamped at -1 (raw <= -3)`);
    } else if (ema50Raw >= 0) {
      lines.push(`  segment [0→0, 3→+1]: t = ${ema50Raw.toFixed(4)} / 3 = ${(ema50Raw / 3).toFixed(4)}`);
      lines.push(`  normalized = 0 + ${(ema50Raw / 3).toFixed(4)} × 1 = ${sign(tb.ema50Slope.normalized)}${tb.ema50Slope.normalized.toFixed(4)}`);
    } else {
      lines.push(`  segment [-3→-1, 0→0]: t = (${ema50Raw.toFixed(4)} + 3) / 3 = ${((ema50Raw + 3) / 3).toFixed(4)}`);
      lines.push(`  normalized = -1 + ${((ema50Raw + 3) / 3).toFixed(4)} × 1 = ${sign(tb.ema50Slope.normalized)}${tb.ema50Slope.normalized.toFixed(4)}`);
    }
    lines.push('');
  }
  if (macdRaw != null) {
    lines.push(`MACD Histogram: raw = ${sign(macdRaw)}${macdRaw.toFixed(4)}%`);
    lines.push(`  breakpoints: [-1→-1, 0→0, 1→+1]`);
    if (macdRaw >= 1) {
      lines.push(`  clamped at +1 (raw >= 1)`);
    } else if (macdRaw <= -1) {
      lines.push(`  clamped at -1 (raw <= -1)`);
    } else if (macdRaw >= 0) {
      lines.push(`  segment [0→0, 1→+1]: t = ${macdRaw.toFixed(4)}`);
      lines.push(`  normalized = ${sign(tb.macdHistogram.normalized)}${tb.macdHistogram.normalized.toFixed(4)}`);
    } else {
      lines.push(`  segment [-1→-1, 0→0]: t = (${macdRaw.toFixed(4)} + 1) = ${(macdRaw + 1).toFixed(4)}`);
      lines.push(`  normalized = -1 + ${(macdRaw + 1).toFixed(4)} × 1 = ${sign(tb.macdHistogram.normalized)}${tb.macdHistogram.normalized.toFixed(4)}`);
    }
    lines.push('');
  }
  if (rsiRaw != null) {
    lines.push(`RSI Regime: raw = ${rsiRaw.toFixed(2)}`);
    lines.push(`  breakpoints: [20→-1, 30→-0.5, 50→0, 70→+0.5, 80→+1]`);
    if (rsiRaw <= 20) {
      lines.push(`  clamped at -1 (RSI <= 20)`);
    } else if (rsiRaw >= 80) {
      lines.push(`  clamped at +1 (RSI >= 80)`);
    } else if (rsiRaw <= 30) {
      lines.push(`  segment [20→-1, 30→-0.5]: t = (${rsiRaw.toFixed(2)} - 20) / 10 = ${((rsiRaw - 20) / 10).toFixed(4)}`);
      lines.push(`  normalized = -1 + ${((rsiRaw - 20) / 10).toFixed(4)} × 0.5 = ${sign(tb.rsiRegime.normalized)}${tb.rsiRegime.normalized.toFixed(4)}`);
    } else if (rsiRaw <= 50) {
      lines.push(`  segment [30→-0.5, 50→0]: t = (${rsiRaw.toFixed(2)} - 30) / 20 = ${((rsiRaw - 30) / 20).toFixed(4)}`);
      lines.push(`  normalized = -0.5 + ${((rsiRaw - 30) / 20).toFixed(4)} × 0.5 = ${sign(tb.rsiRegime.normalized)}${tb.rsiRegime.normalized.toFixed(4)}`);
    } else if (rsiRaw <= 70) {
      lines.push(`  segment [50→0, 70→+0.5]: t = (${rsiRaw.toFixed(2)} - 50) / 20 = ${((rsiRaw - 50) / 20).toFixed(4)}`);
      lines.push(`  normalized = 0 + ${((rsiRaw - 50) / 20).toFixed(4)} × 0.5 = ${sign(tb.rsiRegime.normalized)}${tb.rsiRegime.normalized.toFixed(4)}`);
    } else {
      lines.push(`  segment [70→+0.5, 80→+1]: t = (${rsiRaw.toFixed(2)} - 70) / 10 = ${((rsiRaw - 70) / 10).toFixed(4)}`);
      lines.push(`  normalized = 0.5 + ${((rsiRaw - 70) / 10).toFixed(4)} × 0.5 = ${sign(tb.rsiRegime.normalized)}${tb.rsiRegime.normalized.toFixed(4)}`);
    }
    lines.push('');
  }
  lines.push('```');
  lines.push('');

  // 2. Confidence Score Formulas
  lines.push('### 2. Confidence Score Formulas');
  lines.push('');
  lines.push('The confidence score measures agreement between volatility estimators and trend decisiveness.');
  lines.push('');
  lines.push('```');
  lines.push('ATR/RV Agreement  = 1 - |atrMove - rvMove| / max(atrMove, rvMove)');
  lines.push('                  → range [0, 1] where 1 = perfect agreement');
  lines.push('');
  lines.push('Options Agreement = 1 - |optionsMove - avgMove| / max(optionsMove, avgMove)');
  lines.push('                    where avgMove = (atrMove + rvMove) / 2');
  lines.push('                    optionsMove = straddle move (preferred) or IV move (fallback)');
  lines.push('                  → range [0, 1] where 1 = options confirm historical vol');
  lines.push('');
  lines.push('Trend Clarity     = |trendScore|');
  lines.push('                  → range [0, 1] where 1 = maximum directional conviction');
  lines.push('```');
  lines.push('');
  if (result.ivAvailable || result.straddleAvailable) {
    lines.push('**With options data (3-component weighted average):**');
    lines.push('`confidence = 0.35 × ATR/RV_Agreement + 0.30 × Options_Agreement + 0.35 × Trend_Clarity`');
  } else {
    lines.push('**Without options data (2-component fallback):**');
    lines.push('`confidence = 0.50 × ATR/RV_Agreement + 0.50 × Trend_Clarity`');
  }
  lines.push('');

  // Show per-horizon confidence derivations
  lines.push('**Actual confidence derivations per horizon:**');
  lines.push('');
  for (const h of result.horizons) {
    const atrMove = h.components.atrMove;
    const rvMove = h.components.rvMove;
    const optMove = h.optionsSource === 'straddle' ? h.components.straddleMove : h.components.ivMove;
    const maxVol = Math.max(atrMove, rvMove);
    const volAgree = maxVol > 0 ? 1 - Math.abs(atrMove - rvMove) / maxVol : 0.5;
    const label = h.targetDate ? `${fmtDate(h.targetDate)} (${h.horizonDays}d)` : h.horizon;
    lines.push(`**${label}**`);
    lines.push('```');
    lines.push(`ATR/RV Agreement  = 1 - |${atrMove.toFixed(2)} - ${rvMove.toFixed(2)}| / max(${atrMove.toFixed(2)}, ${rvMove.toFixed(2)})`);
    lines.push(`                  = 1 - ${Math.abs(atrMove - rvMove).toFixed(2)} / ${maxVol.toFixed(2)}`);
    lines.push(`                  = ${(volAgree * 100).toFixed(1)}%`);
    if (optMove != null) {
      const avgMove = (atrMove + rvMove) / 2;
      const maxVal = Math.max(optMove, avgMove);
      const ivAgree = maxVal > 0 ? 1 - Math.abs(optMove - avgMove) / maxVal : 0.5;
      lines.push('');
      lines.push(`Options Agreement = 1 - |${optMove.toFixed(2)} - ${avgMove.toFixed(2)}| / max(${optMove.toFixed(2)}, ${avgMove.toFixed(2)})`);
      lines.push(`                  = 1 - ${Math.abs(optMove - avgMove).toFixed(2)} / ${maxVal.toFixed(2)}`);
      lines.push(`                  = ${(ivAgree * 100).toFixed(1)}%`);
      lines.push(`                  (source: ${h.optionsSource})`);
    }
    lines.push('');
    lines.push(`Trend Clarity     = |${sign(result.trendScore)}${result.trendScore.toFixed(4)}| = ${Math.abs(result.trendScore).toFixed(4)} = ${(Math.abs(result.trendScore) * 100).toFixed(1)}%`);
    lines.push('');
    if (optMove != null) {
      const avgMove = (atrMove + rvMove) / 2;
      const maxVal = Math.max(optMove, avgMove);
      const ivAgree = maxVal > 0 ? 1 - Math.abs(optMove - avgMove) / maxVal : 0.5;
      lines.push(`Confidence        = 0.35 × ${(volAgree * 100).toFixed(1)}% + 0.30 × ${(ivAgree * 100).toFixed(1)}% + 0.35 × ${(Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                  = ${(0.35 * volAgree * 100).toFixed(1)}% + ${(0.30 * ivAgree * 100).toFixed(1)}% + ${(0.35 * Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                  = ${(h.confidence * 100).toFixed(1)}% (${h.confidenceLabel})`);
    } else {
      lines.push(`Confidence        = 0.50 × ${(volAgree * 100).toFixed(1)}% + 0.50 × ${(Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                  = ${(0.50 * volAgree * 100).toFixed(1)}% + ${(0.50 * Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                  = ${(h.confidence * 100).toFixed(1)}% (${h.confidenceLabel})`);
    }
    lines.push('```');
    lines.push('');
  }

  // 3. Confidence label thresholds
  lines.push('### 3. Confidence Label Thresholds');
  lines.push('');
  lines.push('| Score Range | Label |');
  lines.push('|-------------|-------|');
  lines.push('| ≥ 75% | high |');
  lines.push('| ≥ 60% | medium-high |');
  lines.push('| ≥ 45% | medium |');
  lines.push('| < 45% | low |');
  lines.push('');

  // 4. S/R Structure Formula
  lines.push('### 4. Support/Resistance (S/R) Structure');
  lines.push('');
  lines.push('S/R levels are detected from daily OHLCV bars using swing highs/lows (local extrema)');
  lines.push('and recent N-bar highs and lows as broader price anchors.');
  lines.push('');
  lines.push('```');
  lines.push('Swing detection:');
  lines.push('  swing_high: bar where high > max(high of 3 bars before AND 3 bars after)');
  lines.push('  swing_low:  bar where low  < min(low  of 3 bars before AND 3 bars after)');
  lines.push('');
  lines.push('Lookback windows (scales with horizon):');
  lines.push('  1W: 20 bars    2W: 30 bars    3W: 45 bars    4W: 60 bars');
  lines.push('');
  lines.push('Structure move = avg(dist_to_nearest_support, dist_to_nearest_resistance)');
  lines.push('  → This represents the average expected range implied by price structure');
  lines.push('  → Naturally constrains the blend when S/R is closer than vol-implied range');
  lines.push('```');
  lines.push('');

  // 5. Straddle Expected Move Formula
  lines.push('### 5. Straddle Expected Move');
  lines.push('');
  lines.push('When available, the straddle expected move replaces the IV×sqrt(t/252) formula');
  lines.push('as the primary options-derived component, because it directly embeds:');
  lines.push('volatility skew, jump risk, event risk, and supply/demand.');
  lines.push('');
  lines.push('```');
  lines.push('straddle = ATM_call_midpoint + ATM_put_midpoint');
  lines.push('expectedMove = 0.85 × straddle');
  lines.push('');
  lines.push('ATM strike = strike closest to spot that has both call and put');
  lines.push('');
  lines.push('Cross-expiration handling:');
  lines.push('  exact match:    use straddle directly');
  lines.push('  interpolation:  linear between bracketing expirations');
  lines.push('  extrapolation:  sqrt-time scaling from nearest expiration');
  lines.push('');
  lines.push('Fallback chain:');
  lines.push('  1. straddle available → use straddle expected move');
  lines.push('  2. only IV available  → use IV × sqrt(t/252)');
  lines.push('  3. no options data    → ATR + RV fallback (55%/45%)');
  lines.push('```');
  lines.push('');

  // 6. IV Term Structure Interpolation
  lines.push('### 6. IV Term Structure Interpolation');
  lines.push('');
  lines.push('When multiple option expirations are available, IV is interpolated to match');
  lines.push('each forecast horizon exactly, rather than using a single flat IV.');
  lines.push('');
  lines.push('```');
  lines.push('target_date = today + horizonDays × 1.4 (trading→calendar conversion)');
  lines.push('');
  lines.push('Find bracketing expirations: before_exp ≤ target_date ≤ after_exp');
  lines.push('t = (target_date - before_exp) / (after_exp - before_exp)');
  lines.push('interpolated_IV = before_IV + t × (after_IV - before_IV)');
  lines.push('');
  lines.push('If only one side available: use nearest expiration IV directly');
  lines.push('```');
  lines.push('');

  // 7. Skew label rules
  lines.push('### 7. Skew Label Rules');
  lines.push('');
  lines.push('```');
  lines.push('skewPct = |drift / spot| × 100');
  lines.push('');
  lines.push('if skewPct < 0.2%         → "neutral"');
  lines.push('if drift > 0 and < 0.5%   → "slight bullish"');
  lines.push('if drift > 0 and >= 0.5%  → "bullish"');
  lines.push('if drift < 0 and < 0.5%   → "slight bearish"');
  lines.push('if drift < 0 and >= 0.5%  → "bearish"');
  lines.push('```');
  lines.push('');

  // 8. Volatility / Premium Quality Formulas
  lines.push('### 8. Volatility / Premium Quality Formulas');
  lines.push('');
  lines.push('```');
  lines.push('IV Percentile (Nd):');
  lines.push('  With IV history:   = #(historical_IV < current_IV) / N × 100');
  lines.push('                     → True percentile against daily IV snapshots');
  lines.push('  Without IV history:= #(historical_RV < current_IV) / N × 100');
  lines.push('                     → RV approximation (tends to overstate percentile)');
  lines.push('                     → Higher = IV is richer relative to history');
  lines.push('');
  lines.push('IV Rank (Nd):');
  lines.push('  With IV history:   = (current_IV - min_IV) / (max_IV - min_IV) × 100');
  lines.push('  Without IV history:= (current_IV - min_RV) / (max_RV - min_RV) × 100');
  lines.push('');
  lines.push('IV/RV Ratio          = current_IV_annualized / RV20_annualized');
  lines.push('                     → >1.3 = premium rich, <1.0 = premium cheap');
  lines.push('');
  lines.push('Vol Premium          = current_IV - RV20_annualized (in percentage points)');
  lines.push('');
  lines.push('RV20 Annualized      = daily_sigma × sqrt(252)');
  lines.push('');
  lines.push('Volatility Regime:');
  lines.push('  current_RV / median_RV_history');
  lines.push('  > 2.0  → extreme');
  lines.push('  > 1.5  → elevated');
  lines.push('  > 0.8  → normal');
  lines.push('  <= 0.8 → compressed');
  lines.push('');
  lines.push('Premium Quality Score = 0.45 × IV_Percentile + 0.35 × normalized(IV/RV) + 0.20 × IV_Trend');
  lines.push('  IV/RV normalized: (ratio - 1.0) / 1.0 × 100, clamped [0, 100]');
  lines.push('  IV_Trend: 80 if ratio > 1.3, 50 if > 1.1, else 20');
  lines.push('');
  lines.push('Premium Labels:');
  lines.push('  IV percentile >= 75 AND IV/RV >= 1.3  → "rich"');
  lines.push('  IV percentile >= 50 AND IV/RV >= 1.1  → "moderately attractive"');
  lines.push('  IV percentile >= 25                    → "neutral"');
  lines.push('  else                                   → "cheap"');
  lines.push('```');
  lines.push('');
  if (vm.ivPercentileSource === 'iv_history') {
    lines.push(`Note: IV Percentile and IV Rank use true IV history (${vm.ivHistoryDays} daily snapshots).`);
  } else {
    lines.push(`Note: IV Percentile and IV Rank use RV-based approximation (${vm.ivHistoryDays}/30 IV snapshots collected).`);
    lines.push('This tends to overstate IV percentile because IV > RV most of the time.');
    lines.push('True IV percentile will be used once 30+ daily IV snapshots are available.');
  }
  lines.push('');

  // 9. Constants
  lines.push('### 9. Model Constants');
  lines.push('');
  lines.push('| Constant | Value | Purpose |');
  lines.push('|----------|-------|---------|');
  lines.push('| TREND_DRIFT_K | 0.02 | Drift calibration constant |');
  lines.push('| SIGMA_50 | 0.67 | 50% confidence band multiplier |');
  lines.push('| SIGMA_68 | 1.00 | 68% confidence band multiplier |');
  lines.push('| SIGMA_90 | 1.80 | 90% confidence band multiplier (fat-tail adj from 1.64) |');
  lines.push('| STRADDLE_FACTOR | 0.85 | Straddle to expected move conversion |');
  lines.push('| Trading days/week | 5 | Used in sqrt scaling |');
  lines.push('| Annualization factor | 252 | Trading days per year (for IV) |');
  lines.push('| RV window | 20 days | Rolling realized volatility window |');
  lines.push('');

  return lines.join('\n');
}

export function downloadForecastMarkdown(result: ForecastResult): void {
  const md = generateForecastMarkdown(result);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date(result.generatedAt).toISOString().slice(0, 10);
  a.download = `${result.ticker}_forecast_${dateStr}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download any text content as a .md file */
export function downloadAnalysisMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
