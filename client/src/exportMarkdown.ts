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
  }
  lines.push('```');
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
    const rawMove = key === 'iv' ? h.components.ivMove
      : key === 'atr' ? h.components.atrMove
      : key === 'rv' ? h.components.rvMove : 0;
    parts.push(`  ${key.toUpperCase().padEnd(10)} ${(weight * 100).toFixed(0).padStart(3)}% × $${(rawMove ?? 0).toFixed(2).padStart(8)} = $${contribution.toFixed(2)}`);
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
    ivAgreement: 'IV Agreement',
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
  lines.push(`| IV Used | ${h.ivAvailable ? 'Yes' : 'No'}${h.ivUsed != null ? ` (${(h.ivUsed * 100).toFixed(2)}%)` : ''} |`);
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
  if (result.indicators.ema20Slope != null)
    lines.push(`| EMA(20) Slope | ${sign(result.indicators.ema20Slope)}${result.indicators.ema20Slope.toFixed(4)} |`);
  if (result.indicators.ema50Slope != null)
    lines.push(`| EMA(50) Slope | ${sign(result.indicators.ema50Slope)}${result.indicators.ema50Slope.toFixed(4)} |`);
  if (result.indicators.macdHistogram != null)
    lines.push(`| MACD Histogram | ${sign(result.indicators.macdHistogram)}${result.indicators.macdHistogram.toFixed(4)} |`);
  if (result.indicators.bollingerBandwidth != null)
    lines.push(`| Bollinger Bandwidth | ${result.indicators.bollingerBandwidth.toFixed(4)} |`);
  lines.push('');

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
  lines.push('4. **Blended move**: Apply the weight formula shown for each horizon');
  lines.push('5. **Trend drift**: `spot × 0.02 × trendScore × sqrt(trading_days / 5)`');
  lines.push('6. **Center**: `spot + drift`');
  lines.push('7. **Bands**: `center ± sigma_multiplier × blended_move`');
  lines.push('   - 50% band: σ = 0.67');
  lines.push('   - 68% band: σ = 1.00');
  lines.push('   - 90% band: σ = 1.80 (fat-tail adjusted from 1.64)');
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
