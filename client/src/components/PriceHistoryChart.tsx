import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { fetchChart, ChartBar, ChartPeriod } from '../api';

interface Props {
  ticker: string;
}

const PERIODS: { value: ChartPeriod; label: string }[] = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
];

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function niceStep(range: number, targetTicks: number): number {
  const rawStep = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export default function PriceHistoryChart({ ticker }: Props) {
  const [period, setPeriod] = useState<ChartPeriod>('6m');
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showVolume, setShowVolume] = useState(true);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchChart(ticker, period)
      .then((data) => { if (!cancelled) setBars(data.bars); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, period]);

  if (loading) {
    return (
      <div className="bg-surface-card border border-edge rounded-lg p-5">
        <div className="flex items-center justify-center h-80 text-dim">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading price history...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-card border border-edge rounded-lg p-5">
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      </div>
    );
  }

  if (bars.length === 0) return null;

  // ── Layout ──
  // Price chart (with volume overlay): top area | gap | RSI: bottom subplot
  const marginLeft = 65;
  const marginRight = 15;
  const marginTop = 15;
  const priceHeight = 350;
  const gapHeight = 8;
  const rsiHeight = 100;
  const marginBottom = 30;
  const totalWidth = containerWidth || 800;
  const totalHeight = marginTop + priceHeight + gapHeight + rsiHeight + marginBottom;
  const plotWidth = totalWidth - marginLeft - marginRight;

  // ── Shared X scale ──
  const barW = plotWidth / bars.length;
  const candleW = Math.max(2, Math.min(12, barW * 0.7));
  const xScale = (i: number) => marginLeft + i * barW + barW / 2;

  // ── Price Y scale ──
  const priceValues = bars.flatMap((d) => {
    const vals = [d.high, d.low];
    if (d.bbUpper != null) vals.push(d.bbUpper);
    if (d.bbLower != null) vals.push(d.bbLower);
    if (d.sma200 != null) vals.push(d.sma200);
    return vals;
  });
  const priceMin = Math.min(...priceValues);
  const priceMax = Math.max(...priceValues);
  const pricePad = (priceMax - priceMin) * 0.04;
  const pYMin = priceMin - pricePad;
  const pYMax = priceMax + pricePad;
  const priceYScale = (v: number) => marginTop + priceHeight * (1 - (v - pYMin) / (pYMax - pYMin));

  // Price Y ticks
  const pStep = niceStep(pYMax - pYMin, 8);
  const priceTicks: number[] = [];
  for (let t = Math.ceil(pYMin / pStep) * pStep; t <= pYMax; t += pStep) {
    priceTicks.push(t);
  }

  // ── Volume Y scale (overlaid on bottom ~25% of price chart) ──
  const volOverlayHeight = priceHeight * 0.25;
  const volBottom = marginTop + priceHeight;
  const maxVol = Math.max(...bars.map((b) => b.volume));

  // ── RSI Y scale ──
  const rsiTop = marginTop + priceHeight + gapHeight;
  const rsiYScale = (v: number) => rsiTop + rsiHeight * (1 - v / 100);

  // ── X ticks ──
  const xTickEvery = bars.length <= 65 ? 5 : bars.length <= 130 ? 10 : bars.length <= 260 ? 20 : 40;

  // ── Path builders ──
  function buildPricePath(accessor: (b: ChartBar) => number | null): string {
    let path = '';
    bars.forEach((b, i) => {
      const v = accessor(b);
      if (v == null) return;
      path += path === '' ? `M${xScale(i)},${priceYScale(v)}` : `L${xScale(i)},${priceYScale(v)}`;
    });
    return path;
  }

  function buildRSIPath(): string {
    let path = '';
    bars.forEach((b, i) => {
      if (b.rsi14 == null) return;
      path += path === '' ? `M${xScale(i)},${rsiYScale(b.rsi14)}` : `L${xScale(i)},${rsiYScale(b.rsi14)}`;
    });
    return path;
  }

  function buildBBFillPath(): string {
    const upper: string[] = [];
    const lower: string[] = [];
    bars.forEach((b, i) => {
      if (b.bbUpper == null || b.bbLower == null) return;
      upper.push(`${xScale(i)},${priceYScale(b.bbUpper)}`);
      lower.push(`${xScale(i)},${priceYScale(b.bbLower)}`);
    });
    if (upper.length === 0) return '';
    return `M${upper.join('L')}L${lower.reverse().join('L')}Z`;
  }

  const bbFillPath = buildBBFillPath();
  const bbUpperPath = buildPricePath((b) => b.bbUpper);
  const bbMiddlePath = buildPricePath((b) => b.bbMiddle);
  const bbLowerPath = buildPricePath((b) => b.bbLower);
  const sma20Path = buildPricePath((b) => b.sma20);
  const sma50Path = buildPricePath((b) => b.sma50);
  const sma200Path = buildPricePath((b) => b.sma200);
  const rsiPath = buildRSIPath();

  const hoveredBar = hoverIndex != null ? bars[hoverIndex] : null;

  return (
    <div className="bg-surface-card border border-edge rounded-lg p-5">
      {/* Header row: title + hover readout + period buttons */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-dim mb-1">Price History</h3>
          <div className="relative" style={{ height: 36 }}>
            <div className="absolute inset-0 overflow-hidden">
              {hoveredBar ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs font-mono">
                  <span className="text-white font-medium font-sans">{formatDateFull(hoveredBar.date)}</span>
                  <span className="text-dim">O <span className="text-white">{hoveredBar.open.toFixed(2)}</span></span>
                  <span className="text-dim">H <span className="text-white">{hoveredBar.high.toFixed(2)}</span></span>
                  <span className="text-dim">L <span className="text-white">{hoveredBar.low.toFixed(2)}</span></span>
                  <span className="text-dim">C{' '}
                    <span style={{ color: hoveredBar.close >= hoveredBar.open ? '#26a69a' : '#ef5350' }}>
                      {hoveredBar.close.toFixed(2)} ({hoveredBar.close >= hoveredBar.open ? '+' : ''}{((hoveredBar.close - hoveredBar.open) / hoveredBar.open * 100).toFixed(2)}%)
                    </span>
                  </span>
                  {hoveredBar.sma20 != null && (
                    <span><span className="text-[#f59e0b]">SMA20</span> <span className="text-white">{hoveredBar.sma20.toFixed(2)}</span></span>
                  )}
                  {hoveredBar.sma50 != null && (
                    <span><span className="text-[#a855f7]">SMA50</span> <span className="text-white">{hoveredBar.sma50.toFixed(2)}</span></span>
                  )}
                  {hoveredBar.sma200 != null && (
                    <span><span className="text-[#06b6d4]">SMA200</span> <span className="text-white">{hoveredBar.sma200.toFixed(2)}</span></span>
                  )}
                  {hoveredBar.bbUpper != null && (
                    <>
                      <span><span className="text-[#4f8ff7]">BB</span> <span className="text-white">{hoveredBar.bbLower!.toFixed(2)}</span><span className="text-dim"> — </span><span className="text-white">{hoveredBar.bbUpper.toFixed(2)}</span></span>
                      <span><span className="text-[#ef4444]/70">Basis</span> <span className="text-white">{hoveredBar.bbMiddle!.toFixed(2)}</span></span>
                    </>
                  )}
                  {hoveredBar.rsi14 != null && (
                    <span><span className="text-[#eab308]">RSI</span>{' '}
                      <span style={{ color: hoveredBar.rsi14 >= 70 ? '#ef5350' : hoveredBar.rsi14 <= 30 ? '#26a69a' : '#e1e4ea' }}>
                        {hoveredBar.rsi14.toFixed(1)}
                      </span>
                    </span>
                  )}
                  <span className="text-dim">Vol <span className="text-white">{(hoveredBar.volume / 1e6).toFixed(1)}M</span></span>
                </div>
              ) : (
                <div className="text-xs text-dim/50">Hover over chart for details</div>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 items-center">
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors mr-2 ${
              showVolume
                ? 'bg-surface text-white border border-edge'
                : 'bg-surface text-dim hover:text-white border border-transparent'
            }`}
            title="Toggle volume bars"
          >
            Vol
          </button>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                period === p.value
                  ? 'bg-accent text-white'
                  : 'bg-surface text-dim hover:text-white hover:bg-surface-hover'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="w-full relative" style={{ height: totalHeight }}>
        {containerWidth > 0 && (
          <svg
            width={totalWidth}
            height={totalHeight}
            className="select-none"
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* ═══ PRICE CHART ═══ */}

            {/* Grid lines */}
            {priceTicks.map((t) => (
              <line key={t} x1={marginLeft} y1={priceYScale(t)} x2={totalWidth - marginRight} y2={priceYScale(t)} stroke="#2a2e3a" strokeDasharray="3 3" />
            ))}

            {/* Y-axis labels */}
            {priceTicks.map((t) => (
              <text key={t} x={marginLeft - 8} y={priceYScale(t)} fill="#8b8fa3" fontSize={11} textAnchor="end" dominantBaseline="middle">
                ${t.toFixed(0)}
              </text>
            ))}

            {/* Bollinger Band fill + lines */}
            {bbFillPath && <path d={bbFillPath} fill="#4f8ff7" fillOpacity={0.07} />}
            {bbUpperPath && <path d={bbUpperPath} fill="none" stroke="#4f8ff7" strokeWidth={1} strokeDasharray="4 2" />}
            {bbLowerPath && <path d={bbLowerPath} fill="none" stroke="#4f8ff7" strokeWidth={1} strokeDasharray="4 2" />}
            {bbMiddlePath && <path d={bbMiddlePath} fill="none" stroke="#ef4444" strokeWidth={1} strokeOpacity={0.7} />}

            {/* SMA lines */}
            {sma20Path && <path d={sma20Path} fill="none" stroke="#f59e0b" strokeWidth={1.5} />}
            {sma50Path && <path d={sma50Path} fill="none" stroke="#a855f7" strokeWidth={1.5} />}
            {sma200Path && <path d={sma200Path} fill="none" stroke="#06b6d4" strokeWidth={1.5} strokeDasharray="6 3" />}

            {/* Candlesticks */}
            {bars.map((b, i) => {
              const cx = xScale(i);
              const isUp = b.close >= b.open;
              const color = isUp ? '#26a69a' : '#ef5350';
              const bodyTop = priceYScale(Math.max(b.open, b.close));
              const bodyH = Math.max(1, priceYScale(Math.min(b.open, b.close)) - bodyTop);
              return (
                <g key={i}>
                  <line x1={cx} y1={priceYScale(b.high)} x2={cx} y2={priceYScale(b.low)} stroke={color} strokeWidth={1} />
                  <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={0.5} />
                </g>
              );
            })}

            {/* ═══ VOLUME BARS (overlaid on price chart bottom) ═══ */}
            {showVolume && bars.map((b, i) => {
              const cx = xScale(i);
              const isUp = b.close >= b.open;
              const barH = Math.max(1, (b.volume / maxVol) * volOverlayHeight);
              return (
                <rect
                  key={`v${i}`}
                  x={cx - candleW / 2}
                  y={volBottom - barH}
                  width={candleW}
                  height={barH}
                  fill={isUp ? '#26a69a' : '#ef5350'}
                  fillOpacity={0.2}
                />
              );
            })}

            {/* ═══ RSI SUBPLOT ═══ */}
            {/* Separator line */}
            <line x1={marginLeft} y1={rsiTop} x2={totalWidth - marginRight} y2={rsiTop} stroke="#2a2e3a" strokeWidth={0.5} />

            {/* RSI reference zones */}
            {/* Extreme overbought zone (80-100) */}
            <rect x={marginLeft} y={rsiYScale(100)} width={plotWidth} height={rsiYScale(80) - rsiYScale(100)} fill="#ef5350" fillOpacity={0.08} />
            {/* Overbought zone (70-80) */}
            <rect x={marginLeft} y={rsiYScale(80)} width={plotWidth} height={rsiYScale(70) - rsiYScale(80)} fill="#ef5350" fillOpacity={0.04} />
            {/* Oversold zone (20-30) */}
            <rect x={marginLeft} y={rsiYScale(30)} width={plotWidth} height={rsiYScale(20) - rsiYScale(30)} fill="#26a69a" fillOpacity={0.04} />
            {/* Extreme oversold zone (0-20) */}
            <rect x={marginLeft} y={rsiYScale(20)} width={plotWidth} height={rsiYScale(0) - rsiYScale(20)} fill="#26a69a" fillOpacity={0.08} />

            {/* RSI guide lines at 20, 30, 70, 80 */}
            <line x1={marginLeft} y1={rsiYScale(80)} x2={totalWidth - marginRight} y2={rsiYScale(80)} stroke="#ef5350" strokeWidth={0.5} strokeDasharray="3 3" strokeOpacity={0.7} />
            <line x1={marginLeft} y1={rsiYScale(70)} x2={totalWidth - marginRight} y2={rsiYScale(70)} stroke="#ef5350" strokeWidth={0.5} strokeDasharray="3 3" strokeOpacity={0.4} />
            <line x1={marginLeft} y1={rsiYScale(30)} x2={totalWidth - marginRight} y2={rsiYScale(30)} stroke="#26a69a" strokeWidth={0.5} strokeDasharray="3 3" strokeOpacity={0.4} />
            <line x1={marginLeft} y1={rsiYScale(20)} x2={totalWidth - marginRight} y2={rsiYScale(20)} stroke="#26a69a" strokeWidth={0.5} strokeDasharray="3 3" strokeOpacity={0.7} />

            {/* RSI Y-axis labels */}
            <text x={marginLeft - 8} y={rsiYScale(80)} fill="#ef5350" fontSize={9} textAnchor="end" dominantBaseline="middle" fillOpacity={0.8}>80</text>
            <text x={marginLeft - 8} y={rsiYScale(70)} fill="#ef5350" fontSize={9} textAnchor="end" dominantBaseline="middle" fillOpacity={0.5}>70</text>
            <text x={marginLeft - 8} y={rsiYScale(30)} fill="#26a69a" fontSize={9} textAnchor="end" dominantBaseline="middle" fillOpacity={0.5}>30</text>
            <text x={marginLeft - 8} y={rsiYScale(20)} fill="#26a69a" fontSize={9} textAnchor="end" dominantBaseline="middle" fillOpacity={0.8}>20</text>

            {/* RSI line */}
            {rsiPath && <path d={rsiPath} fill="none" stroke="#eab308" strokeWidth={1.5} />}

            {/* RSI label */}
            <text x={marginLeft + 4} y={rsiTop + 12} fill="#eab308" fontSize={10} fillOpacity={0.7}>RSI 14</text>

            {/* ═══ X-AXIS LABELS ═══ */}
            {bars.map((b, i) => {
              if (i % xTickEvery !== 0) return null;
              return (
                <text key={i} x={xScale(i)} y={totalHeight - 8} fill="#8b8fa3" fontSize={11} textAnchor="middle">
                  {formatDateShort(b.date)}
                </text>
              );
            })}

            {/* ═══ HOVER HIT AREAS + CROSSHAIR ═══ */}
            {bars.map((_, i) => (
              <rect
                key={i}
                x={xScale(i) - barW / 2}
                y={marginTop}
                width={barW}
                height={totalHeight - marginTop - marginBottom}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
              />
            ))}

            {hoverIndex != null && (
              <line
                x1={xScale(hoverIndex)}
                y1={marginTop}
                x2={xScale(hoverIndex)}
                y2={rsiTop + rsiHeight}
                stroke="#8b8fa3"
                strokeWidth={0.5}
                strokeDasharray="4 2"
              />
            )}
          </svg>
        )}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-3 text-xs text-dim flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5">
            <span className="w-2 h-3 bg-[#26a69a] inline-block rounded-sm" />
            <span className="w-2 h-3 bg-[#ef5350] inline-block rounded-sm" />
          </span>
          OHLC
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#f59e0b] inline-block" /> SMA 20
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#a855f7] inline-block" /> SMA 50
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block" style={{ borderTop: '1.5px dashed #06b6d4' }} /> SMA 200
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block" style={{ borderTop: '1px dashed #4f8ff7' }} /> BB (20, 2)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#ef4444]/70 inline-block" /> BB Basis
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#eab308] inline-block" /> RSI 14
        </span>
      </div>
    </div>
  );
}
