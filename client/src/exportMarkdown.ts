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
    // Determine segment
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
  lines.push('ATR/RV Agreement = 1 - |atrMove - rvMove| / max(atrMove, rvMove)');
  lines.push('                 → measures how closely ATR and RV volatility estimates agree');
  lines.push('                 → range [0, 1] where 1 = perfect agreement');
  lines.push('');
  lines.push('IV Agreement     = 1 - |ivMove - avgMove| / max(ivMove, avgMove)');
  lines.push('                   where avgMove = (atrMove + rvMove) / 2');
  lines.push('                 → measures how IV aligns with statistical vol estimates');
  lines.push('                 → range [0, 1] where 1 = IV confirms historical vol');
  lines.push('');
  lines.push('Trend Clarity    = |trendScore|');
  lines.push('                 → measures how decisive the current trend signal is');
  lines.push('                 → range [0, 1] where 1 = maximum directional conviction');
  lines.push('```');
  lines.push('');
  if (result.ivAvailable) {
    lines.push('**With IV (3-component weighted average):**');
    lines.push('`confidence = 0.35 × ATR/RV_Agreement + 0.30 × IV_Agreement + 0.35 × Trend_Clarity`');
  } else {
    lines.push('**Without IV (2-component fallback):**');
    lines.push('`confidence = 0.50 × ATR/RV_Agreement + 0.50 × Trend_Clarity`');
  }
  lines.push('');

  // Show per-horizon confidence derivations
  lines.push('**Actual confidence derivations per horizon:**');
  lines.push('');
  for (const h of result.horizons) {
    const atrMove = h.components.atrMove;
    const rvMove = h.components.rvMove;
    const ivMove = h.components.ivMove;
    const maxVol = Math.max(atrMove, rvMove);
    const volAgree = maxVol > 0 ? 1 - Math.abs(atrMove - rvMove) / maxVol : 0.5;
    const label = h.targetDate ? `${fmtDate(h.targetDate)} (${h.horizonDays}d)` : h.horizon;
    lines.push(`**${label}**`);
    lines.push('```');
    lines.push(`ATR/RV Agreement = 1 - |${atrMove.toFixed(2)} - ${rvMove.toFixed(2)}| / max(${atrMove.toFixed(2)}, ${rvMove.toFixed(2)})`);
    lines.push(`                 = 1 - ${Math.abs(atrMove - rvMove).toFixed(2)} / ${maxVol.toFixed(2)}`);
    lines.push(`                 = ${(volAgree * 100).toFixed(1)}%`);
    if (ivMove != null) {
      const avgMove = (atrMove + rvMove) / 2;
      const maxVal = Math.max(ivMove, avgMove);
      const ivAgree = maxVal > 0 ? 1 - Math.abs(ivMove - avgMove) / maxVal : 0.5;
      lines.push('');
      lines.push(`IV Agreement     = 1 - |${ivMove.toFixed(2)} - ${avgMove.toFixed(2)}| / max(${ivMove.toFixed(2)}, ${avgMove.toFixed(2)})`);
      lines.push(`                 = 1 - ${Math.abs(ivMove - avgMove).toFixed(2)} / ${maxVal.toFixed(2)}`);
      lines.push(`                 = ${(ivAgree * 100).toFixed(1)}%`);
    }
    lines.push('');
    lines.push(`Trend Clarity    = |${sign(result.trendScore)}${result.trendScore.toFixed(4)}| = ${Math.abs(result.trendScore).toFixed(4)} = ${(Math.abs(result.trendScore) * 100).toFixed(1)}%`);
    lines.push('');
    if (ivMove != null) {
      const avgMove = (atrMove + rvMove) / 2;
      const maxVal = Math.max(ivMove, avgMove);
      const ivAgree = maxVal > 0 ? 1 - Math.abs(ivMove - avgMove) / maxVal : 0.5;
      lines.push(`Confidence       = 0.35 × ${(volAgree * 100).toFixed(1)}% + 0.30 × ${(ivAgree * 100).toFixed(1)}% + 0.35 × ${(Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                 = ${(0.35 * volAgree * 100).toFixed(1)}% + ${(0.30 * ivAgree * 100).toFixed(1)}% + ${(0.35 * Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                 = ${(h.confidence * 100).toFixed(1)}% (${h.confidenceLabel})`);
    } else {
      lines.push(`Confidence       = 0.50 × ${(volAgree * 100).toFixed(1)}% + 0.50 × ${(Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                 = ${(0.50 * volAgree * 100).toFixed(1)}% + ${(0.50 * Math.abs(result.trendScore) * 100).toFixed(1)}%`);
      lines.push(`                 = ${(h.confidence * 100).toFixed(1)}% (${h.confidenceLabel})`);
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

  // 4. S/R term status
  lines.push('### 4. Support/Resistance (S/R) Term');
  lines.push('');
  lines.push('The blending formula allocates a weight to a structure term (S/R), but the S/R');
  lines.push('calculation is **not yet implemented**. The S/R contribution is currently hardcoded to `0`');
  lines.push('across all horizons. The allocated weight is effectively redistributed to IV/ATR/RV');
  lines.push('only in the sense that S/R × 0 = 0; the other weights are unchanged.');
  lines.push('');
  lines.push('```');
  lines.push('Blending weights (with IV):');
  lines.push('  1W: 55% IV + 25% ATR + 15% RV +  5% S/R(=0)');
  lines.push('  2W: 50% IV + 25% ATR + 15% RV + 10% S/R(=0)');
  lines.push('  3W: 45% IV + 25% ATR + 15% RV + 15% S/R(=0)');
  lines.push('  4W: 40% IV + 25% ATR + 15% RV + 20% S/R(=0)');
  lines.push('');
  lines.push('Blending weights (without IV fallback):');
  lines.push('  All: 55% ATR + 45% RV');
  lines.push('```');
  lines.push('');

  // 5. Skew label rules
  lines.push('### 5. Skew Label Rules');
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

  // 6. Constants
  lines.push('### 6. Model Constants');
  lines.push('');
  lines.push('| Constant | Value | Purpose |');
  lines.push('|----------|-------|---------|');
  lines.push('| TREND_DRIFT_K | 0.02 | Drift calibration constant |');
  lines.push('| SIGMA_50 | 0.67 | 50% confidence band multiplier |');
  lines.push('| SIGMA_68 | 1.00 | 68% confidence band multiplier |');
  lines.push('| SIGMA_90 | 1.80 | 90% confidence band multiplier (fat-tail adj from 1.64) |');
  lines.push('| Trading days/week | 5 | Used in sqrt scaling |');
  lines.push('| Annualization factor | 252 | Trading days per year (for IV) |');
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
