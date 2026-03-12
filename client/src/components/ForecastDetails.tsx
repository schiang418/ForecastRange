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
    </div>
  );
}
