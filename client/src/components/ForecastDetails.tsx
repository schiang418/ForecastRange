import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ForecastResult, ForecastHorizon } from '../api';

interface Props {
  result: ForecastResult;
  selectedHorizon: ForecastHorizon;
}

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-edge/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface-hover/50 hover:bg-surface-hover text-sm font-medium transition-colors text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-dim" /> : <ChevronRight className="w-4 h-4 text-dim" />}
        {title}
      </button>
      {open && <div className="px-4 py-3 text-sm">{children}</div>}
    </div>
  );
}

function Row({ label, value, dim }: { label: string; value: string | number; dim?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-dim">{label}</span>
      <span className={`font-mono ${dim ? 'text-dim' : ''}`}>{value}</span>
    </div>
  );
}

function Bar({ label, value, maxValue = 1, color = 'bg-accent' }: { label: string; value: number; maxValue?: number; color?: string }) {
  const pct = Math.min(Math.abs(value) / maxValue * 100, 100);
  const isNeg = value < 0;
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-dim">{label}</span>
        <span className="font-mono">{value > 0 ? '+' : ''}{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden flex">
        {isNeg ? (
          <>
            <div className="flex-1" />
            <div className={`${color} rounded-full`} style={{ width: `${pct / 2}%` }} />
            <div className="flex-1" />
          </>
        ) : (
          <div className={`${color} rounded-full`} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

export default function ForecastDetails({ result, selectedHorizon }: Props) {
  const h = selectedHorizon;
  const tb = result.trendBreakdown;

  return (
    <div className="space-y-3">
      {/* Trend Score Breakdown */}
      <Section title={`Trend Score Breakdown (${result.trendScore > 0 ? '+' : ''}${(result.trendScore * 100).toFixed(1)}%)`} defaultOpen>
        <p className="text-xs text-dim mb-3">
          Weighted combination: 0.35*EMA20 + 0.25*EMA50 + 0.20*MACD + 0.20*RSI
        </p>
        <div className="space-y-1">
          <div className="grid grid-cols-4 gap-2 text-xs text-dim border-b border-edge/30 pb-1 mb-1">
            <span>Component</span>
            <span className="text-right">Raw</span>
            <span className="text-right">Normalized</span>
            <span className="text-right">Contribution</span>
          </div>
          {[
            { name: 'EMA20 Slope', data: tb.ema20Slope, unit: '%' },
            { name: 'EMA50 Slope', data: tb.ema50Slope, unit: '%' },
            { name: 'MACD Hist', data: tb.macdHistogram, unit: '%' },
            { name: 'RSI Regime', data: tb.rsiRegime, unit: '' },
          ].map(({ name, data, unit }) => (
            <div key={name} className="grid grid-cols-4 gap-2 text-xs py-0.5">
              <span className="text-dim">{name} <span className="opacity-60">({(data.weight * 100).toFixed(0)}%)</span></span>
              <span className="text-right font-mono">
                {data.raw != null ? `${data.raw > 0 ? '+' : ''}${data.raw.toFixed(2)}${unit}` : 'N/A'}
              </span>
              <span className={`text-right font-mono ${data.normalized > 0 ? 'text-green-400' : data.normalized < 0 ? 'text-red-400' : 'text-dim'}`}>
                {data.normalized > 0 ? '+' : ''}{data.normalized.toFixed(4)}
              </span>
              <span className="text-right font-mono">
                {(data.weight * data.normalized > 0 ? '+' : '')}{(data.weight * data.normalized).toFixed(4)}
              </span>
            </div>
          ))}
          <div className="border-t border-edge/30 pt-1 mt-1 grid grid-cols-4 gap-2 text-xs font-medium">
            <span>Total</span>
            <span />
            <span />
            <span className={`text-right font-mono ${result.trendScore > 0 ? 'text-green-400' : result.trendScore < 0 ? 'text-red-400' : ''}`}>
              {result.trendScore > 0 ? '+' : ''}{result.trendScore.toFixed(4)}
            </span>
          </div>
        </div>
      </Section>

      {/* Volatility Components */}
      <Section title={`Volatility Components — ${h.horizon}`} defaultOpen>
        <div className="space-y-2">
          <Row label="ATR(14) raw move" value={`$${h.components.atrMove.toFixed(2)}`} />
          <Row label={`ATR formula: ATR14 * sqrt(${h.horizonDays})`} value={`$${result.indicators.atr14.toFixed(2)} * ${Math.sqrt(h.horizonDays).toFixed(3)}`} dim />
          <Row label="RV(20d) raw move" value={`$${h.components.rvMove.toFixed(2)}`} />
          <Row label={`RV formula: spot * sigma * sqrt(${h.horizonDays})`} value={`$${result.spot.toFixed(2)} * ${(result.indicators.rv20Daily * 100).toFixed(2)}% * ${Math.sqrt(h.horizonDays).toFixed(3)}`} dim />
          {h.components.ivMove != null && (
            <>
              <Row label="IV raw move" value={`$${h.components.ivMove.toFixed(2)}`} />
              <Row label={`IV formula: spot * IV * sqrt(${h.horizonDays}/252)`} value={`$${result.spot.toFixed(2)} * ${h.ivUsed != null ? (h.ivUsed * 100).toFixed(1) + '%' : 'N/A'} * ${Math.sqrt(h.horizonDays / 252).toFixed(4)}`} dim />
            </>
          )}
        </div>
      </Section>

      {/* Blending Formula */}
      <Section title={`Blending Formula — ${h.horizon}`} defaultOpen>
        <p className="text-xs text-dim mb-3 font-mono">{h.blending.formula}</p>
        <div className="space-y-2">
          {Object.entries(h.blending.contributions).map(([key, value]) => {
            const weight = h.blending.weights[key];
            const rawMove = key === 'iv' ? h.components.ivMove
              : key === 'atr' ? h.components.atrMove
              : key === 'rv' ? h.components.rvMove : 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-dim w-20 uppercase">{key}</span>
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${(value / h.expectedMove) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono w-28 text-right">
                  {(weight * 100).toFixed(0)}% * ${rawMove?.toFixed(2) ?? '0'} = ${value.toFixed(2)}
                </span>
              </div>
            );
          })}
          <div className="border-t border-edge/30 pt-2 flex justify-between text-sm font-medium">
            <span>Blended Move</span>
            <span className="font-mono">${h.expectedMove.toFixed(2)} ({h.expectedMovePct.toFixed(1)}%)</span>
          </div>
        </div>
      </Section>

      {/* Trend Drift Calculation */}
      <Section title={`Trend Drift — ${h.horizon}`}>
        <p className="text-xs text-dim mb-2 font-mono">{h.trendDriftCalc.formula}</p>
        <div className="space-y-1">
          <Row label="Spot" value={`$${h.trendDriftCalc.values.spot.toFixed(2)}`} />
          <Row label="k (calibration constant)" value={h.trendDriftCalc.values.k} />
          <Row label="Trend Score" value={`${h.trendDriftCalc.values.trendScore > 0 ? '+' : ''}${h.trendDriftCalc.values.trendScore.toFixed(4)}`} />
          <Row label={`sqrt(${h.horizonDays}/5)`} value={h.trendDriftCalc.values.sqrtFactor.toFixed(4)} />
          <div className="border-t border-edge/30 pt-1 mt-1">
            <Row label="Trend Drift" value={`${h.trendDriftCalc.result > 0 ? '+' : ''}$${h.trendDriftCalc.result.toFixed(2)}`} />
            <Row label="Center" value={`$${h.bandCalc.centerUsed.toFixed(2)}`} dim />
          </div>
        </div>
      </Section>

      {/* Band Construction */}
      <Section title={`Band Construction — ${h.horizon}`}>
        <p className="text-xs text-dim mb-2">center +/- sigma * blendedMove</p>
        <div className="space-y-1">
          <Row label="Center" value={`$${h.bandCalc.centerUsed.toFixed(2)}`} />
          <Row label="Blended Move" value={`$${h.bandCalc.moveUsed.toFixed(2)}`} />
          <div className="border-t border-edge/30 pt-1 mt-1">
            <Row label={`50% band (${h.bandCalc.sigmaMultipliers.band50}σ)`} value={`$${h.range50.low.toFixed(2)} — $${h.range50.high.toFixed(2)}`} />
            <Row label={`68% band (${h.bandCalc.sigmaMultipliers.band68}σ)`} value={`$${h.range68.low.toFixed(2)} — $${h.range68.high.toFixed(2)}`} />
            <Row label={`90% band (${h.bandCalc.sigmaMultipliers.band90}σ, fat-tail adj)`} value={`$${h.range90.low.toFixed(2)} — $${h.range90.high.toFixed(2)}`} />
          </div>
        </div>
      </Section>

      {/* Confidence Breakdown */}
      <Section title={`Confidence Breakdown — ${h.horizon} (${(h.confidence * 100).toFixed(0)}% ${h.confidenceLabel})`}>
        <div className="space-y-2">
          {Object.entries(h.confidenceBreakdown).map(([key, comp]) => {
            const labels: Record<string, string> = {
              volAgreement: 'ATR/RV Agreement',
              ivAgreement: 'IV Agreement',
              trendClarity: 'Trend Clarity',
            };
            return (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-dim">{labels[key] || key} ({(comp.weight * 100).toFixed(0)}%)</span>
                  <span className="font-mono">{(comp.value * 100).toFixed(1)}% * {(comp.weight * 100).toFixed(0)}% = {(comp.value * comp.weight * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${comp.value >= 0.7 ? 'bg-green-500' : comp.value >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${comp.value * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Audit Reference */}
      <Section title="Audit Reference">
        <div className="space-y-4">
          {/* Trend Score Normalization Rules */}
          <div>
            <h4 className="text-xs font-semibold text-dim uppercase tracking-wide mb-2">1. Trend Score Normalization Rules</h4>
            <p className="text-xs text-dim mb-2">
              Each raw indicator is mapped to [-1, +1] via piecewise linear interpolation (gradientScore), clamped at boundaries.
            </p>
            <div className="bg-surface rounded-lg p-3 font-mono text-xs space-y-2">
              <div>
                <span className="text-dim">EMA20 Slope:</span>{' '}
                <span className="text-yellow-300">[-5% → -1, 0% → 0, +5% → +1]</span>
                {tb.ema20Slope.raw != null && (
                  <div className="ml-4 text-dim mt-0.5">
                    raw={tb.ema20Slope.raw > 0 ? '+' : ''}{tb.ema20Slope.raw.toFixed(4)}% → norm={tb.ema20Slope.normalized > 0 ? '+' : ''}{tb.ema20Slope.normalized.toFixed(4)}
                    {tb.ema20Slope.raw >= 0
                      ? ` (segment [0,5]: ${tb.ema20Slope.raw.toFixed(4)}/5 = ${(tb.ema20Slope.raw / 5).toFixed(4)})`
                      : ` (segment [-5,0]: (${tb.ema20Slope.raw.toFixed(4)}+5)/5 = ${((tb.ema20Slope.raw + 5) / 5).toFixed(4)})`
                    }
                  </div>
                )}
              </div>
              <div>
                <span className="text-dim">EMA50 Slope:</span>{' '}
                <span className="text-yellow-300">[-3% → -1, 0% → 0, +3% → +1]</span>
                {tb.ema50Slope.raw != null && (
                  <div className="ml-4 text-dim mt-0.5">
                    raw={tb.ema50Slope.raw > 0 ? '+' : ''}{tb.ema50Slope.raw.toFixed(4)}% → norm={tb.ema50Slope.normalized > 0 ? '+' : ''}{tb.ema50Slope.normalized.toFixed(4)}
                    {tb.ema50Slope.raw >= 3 ? ' (clamped at +1)'
                      : tb.ema50Slope.raw <= -3 ? ' (clamped at -1)'
                      : tb.ema50Slope.raw >= 0
                        ? ` (segment [0,3]: ${tb.ema50Slope.raw.toFixed(4)}/3 = ${(tb.ema50Slope.raw / 3).toFixed(4)})`
                        : ` (segment [-3,0]: (${tb.ema50Slope.raw.toFixed(4)}+3)/3 = ${((tb.ema50Slope.raw + 3) / 3).toFixed(4)})`
                    }
                  </div>
                )}
              </div>
              <div>
                <span className="text-dim">MACD Histogram:</span>{' '}
                <span className="text-yellow-300">[-1% → -1, 0% → 0, +1% → +1]</span>
                {tb.macdHistogram.raw != null && (
                  <div className="ml-4 text-dim mt-0.5">
                    raw={tb.macdHistogram.raw > 0 ? '+' : ''}{tb.macdHistogram.raw.toFixed(4)}% → norm={tb.macdHistogram.normalized > 0 ? '+' : ''}{tb.macdHistogram.normalized.toFixed(4)}
                    {tb.macdHistogram.raw >= 1 ? ' (clamped at +1)'
                      : tb.macdHistogram.raw <= -1 ? ' (clamped at -1)'
                      : ` (linear: raw value = normalized)`
                    }
                  </div>
                )}
              </div>
              <div>
                <span className="text-dim">RSI Regime:</span>{' '}
                <span className="text-yellow-300">[20 → -1, 30 → -0.5, 50 → 0, 70 → +0.5, 80 → +1]</span>
                {tb.rsiRegime.raw != null && (() => {
                  const rsi = tb.rsiRegime.raw;
                  let segmentInfo = '';
                  if (rsi <= 20) segmentInfo = 'clamped at -1';
                  else if (rsi >= 80) segmentInfo = 'clamped at +1';
                  else if (rsi <= 30) segmentInfo = `segment [20,30]: t=(${rsi.toFixed(2)}-20)/10=${((rsi - 20) / 10).toFixed(4)}, score=-1+t×0.5`;
                  else if (rsi <= 50) segmentInfo = `segment [30,50]: t=(${rsi.toFixed(2)}-30)/20=${((rsi - 30) / 20).toFixed(4)}, score=-0.5+t×0.5`;
                  else if (rsi <= 70) segmentInfo = `segment [50,70]: t=(${rsi.toFixed(2)}-50)/20=${((rsi - 50) / 20).toFixed(4)}, score=0+t×0.5`;
                  else segmentInfo = `segment [70,80]: t=(${rsi.toFixed(2)}-70)/10=${((rsi - 70) / 10).toFixed(4)}, score=0.5+t×0.5`;
                  return (
                    <div className="ml-4 text-dim mt-0.5">
                      raw={rsi.toFixed(2)} → norm={tb.rsiRegime.normalized > 0 ? '+' : ''}{tb.rsiRegime.normalized.toFixed(4)} ({segmentInfo})
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Confidence Score Formulas */}
          <div>
            <h4 className="text-xs font-semibold text-dim uppercase tracking-wide mb-2">2. Confidence Score Formulas</h4>
            <div className="bg-surface rounded-lg p-3 font-mono text-xs space-y-2">
              <div>
                <span className="text-dim">ATR/RV Agreement</span> = 1 - |atrMove - rvMove| / max(atrMove, rvMove)
              </div>
              {h.ivAvailable && (
                <div>
                  <span className="text-dim">IV Agreement</span> = 1 - |ivMove - avgMove| / max(ivMove, avgMove)
                  <div className="ml-4 text-dim">where avgMove = (atrMove + rvMove) / 2</div>
                </div>
              )}
              <div>
                <span className="text-dim">Trend Clarity</span> = |trendScore|
              </div>
              <div className="border-t border-edge/30 pt-2 mt-2">
                <div className="text-dim mb-1">Derivation for {h.horizon}:</div>
                {(() => {
                  const atrMove = h.components.atrMove;
                  const rvMove = h.components.rvMove;
                  const ivMove = h.components.ivMove;
                  const maxVol = Math.max(atrMove, rvMove);
                  const volAgree = maxVol > 0 ? 1 - Math.abs(atrMove - rvMove) / maxVol : 0.5;
                  const trendClarity = Math.abs(result.trendScore);
                  return (
                    <div className="space-y-1">
                      <div>
                        ATR/RV = 1 - |{atrMove.toFixed(2)} - {rvMove.toFixed(2)}| / max({atrMove.toFixed(2)}, {rvMove.toFixed(2)})
                        = 1 - {Math.abs(atrMove - rvMove).toFixed(2)} / {maxVol.toFixed(2)}
                        = <span className="text-white">{(volAgree * 100).toFixed(1)}%</span>
                      </div>
                      {ivMove != null && (() => {
                        const avgMove = (atrMove + rvMove) / 2;
                        const maxVal = Math.max(ivMove, avgMove);
                        const ivAgree = maxVal > 0 ? 1 - Math.abs(ivMove - avgMove) / maxVal : 0.5;
                        return (
                          <div>
                            IV Agr = 1 - |{ivMove.toFixed(2)} - {avgMove.toFixed(2)}| / max({ivMove.toFixed(2)}, {avgMove.toFixed(2)})
                            = 1 - {Math.abs(ivMove - avgMove).toFixed(2)} / {maxVal.toFixed(2)}
                            = <span className="text-white">{(ivAgree * 100).toFixed(1)}%</span>
                          </div>
                        );
                      })()}
                      <div>
                        Trend  = |{result.trendScore > 0 ? '+' : ''}{result.trendScore.toFixed(4)}| = <span className="text-white">{(trendClarity * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* S/R Term Status */}
          <div>
            <h4 className="text-xs font-semibold text-dim uppercase tracking-wide mb-2">3. S/R Term Status</h4>
            <div className="bg-surface rounded-lg p-3 text-xs">
              <p className="text-yellow-400 mb-1">S/R contribution is currently hardcoded to 0 (not yet implemented)</p>
              <p className="text-dim">
                The blending weights reserve 5-20% for S/R depending on horizon, but the structure move is always 0.
                The effective blend uses only IV + ATR + RV (or ATR + RV when IV is unavailable).
              </p>
              <div className="font-mono text-dim mt-2 space-y-0.5">
                <div>1W: 55% IV + 25% ATR + 15% RV + 5% S/R(=0)</div>
                <div>2W: 50% IV + 25% ATR + 15% RV + 10% S/R(=0)</div>
                <div>3W: 45% IV + 25% ATR + 15% RV + 15% S/R(=0)</div>
                <div>4W: 40% IV + 25% ATR + 15% RV + 20% S/R(=0)</div>
              </div>
            </div>
          </div>

          {/* Confidence Label Thresholds */}
          <div>
            <h4 className="text-xs font-semibold text-dim uppercase tracking-wide mb-2">4. Confidence Labels</h4>
            <div className="bg-surface rounded-lg p-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-1">
                <span className="text-dim">≥ 75%</span><span className="text-green-400">high</span>
                <span className="text-dim">≥ 60%</span><span className="text-blue-400">medium-high</span>
                <span className="text-dim">≥ 45%</span><span className="text-yellow-400">medium</span>
                <span className="text-dim">&lt; 45%</span><span className="text-red-400">low</span>
              </div>
            </div>
          </div>

          {/* Skew Label Rules */}
          <div>
            <h4 className="text-xs font-semibold text-dim uppercase tracking-wide mb-2">5. Skew Label Rules</h4>
            <div className="bg-surface rounded-lg p-3 text-xs font-mono">
              <div className="text-dim mb-1">skewPct = |drift / spot| × 100</div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <span className="text-dim">skewPct &lt; 0.2%</span><span className="text-gray-400">neutral</span>
                <span className="text-dim">drift &gt; 0, &lt; 0.5%</span><span className="text-green-300">slight bullish</span>
                <span className="text-dim">drift &gt; 0, ≥ 0.5%</span><span className="text-green-400">bullish</span>
                <span className="text-dim">drift &lt; 0, &lt; 0.5%</span><span className="text-red-300">slight bearish</span>
                <span className="text-dim">drift &lt; 0, ≥ 0.5%</span><span className="text-red-400">bearish</span>
              </div>
            </div>
          </div>

          {/* Model Constants */}
          <div>
            <h4 className="text-xs font-semibold text-dim uppercase tracking-wide mb-2">6. Model Constants</h4>
            <div className="bg-surface rounded-lg p-3 text-xs font-mono">
              <div className="grid grid-cols-[auto_auto_1fr] gap-x-4 gap-y-1">
                <span className="text-dim">TREND_DRIFT_K</span><span>0.02</span><span className="text-dim">drift calibration</span>
                <span className="text-dim">SIGMA_50</span><span>0.67</span><span className="text-dim">50% band multiplier</span>
                <span className="text-dim">SIGMA_68</span><span>1.00</span><span className="text-dim">68% band multiplier</span>
                <span className="text-dim">SIGMA_90</span><span>1.80</span><span className="text-dim">90% band (fat-tail adj from 1.64)</span>
                <span className="text-dim">Days/week</span><span>5</span><span className="text-dim">trading days per week</span>
                <span className="text-dim">Annualization</span><span>252</span><span className="text-dim">trading days per year (IV)</span>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
