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

interface ChartDimensions {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  plotWidth: number;
  plotHeight: number;
}

/**
 * Pure SVG candlestick chart with Bollinger Bands and SMAs.
 * Using raw SVG instead of Recharts for proper candlestick rendering.
 */
export default function PriceHistoryChart({ ticker }: Props) {
  const [period, setPeriod] = useState<ChartPeriod>('6m');
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  // Chart dimensions
  const svgHeight = 420;
  const dim: ChartDimensions = {
    width: containerWidth || 800,
    height: svgHeight,
    marginTop: 15,
    marginRight: 15,
    marginBottom: 30,
    marginLeft: 65,
    get plotWidth() { return this.width - this.marginLeft - this.marginRight; },
    get plotHeight() { return this.height - this.marginTop - this.marginBottom; },
  };

  // Y domain
  const allValues = bars.flatMap((d) => {
    const vals = [d.high, d.low];
    if (d.bbUpper != null) vals.push(d.bbUpper);
    if (d.bbLower != null) vals.push(d.bbLower);
    return vals;
  });
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const yPadding = (dataMax - dataMin) * 0.04;
  const yMin = dataMin - yPadding;
  const yMax = dataMax + yPadding;

  // Scale functions
  const barWidth = dim.plotWidth / bars.length;
  const candleWidth = Math.max(2, Math.min(12, barWidth * 0.7));
  const xScale = (i: number) => dim.marginLeft + i * barWidth + barWidth / 2;
  const yScale = (v: number) => dim.marginTop + dim.plotHeight * (1 - (v - yMin) / (yMax - yMin));

  // Y-axis ticks
  const yRange = yMax - yMin;
  const rawStep = yRange / 8;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceStep = normalized <= 1 ? magnitude
    : normalized <= 2 ? 2 * magnitude
    : normalized <= 5 ? 5 * magnitude
    : 10 * magnitude;
  const yTicks: number[] = [];
  const firstTick = Math.ceil(yMin / niceStep) * niceStep;
  for (let t = firstTick; t <= yMax; t += niceStep) {
    yTicks.push(t);
  }

  // X-axis ticks (show every Nth date label)
  const xTickEvery = bars.length <= 65 ? 5 : bars.length <= 130 ? 10 : bars.length <= 260 ? 20 : 40;

  // Build line paths for BB and SMA
  function buildLinePath(accessor: (b: ChartBar) => number | null): string {
    let path = '';
    bars.forEach((b, i) => {
      const v = accessor(b);
      if (v == null) return;
      const x = xScale(i);
      const y = yScale(v);
      path += path === '' ? `M${x},${y}` : `L${x},${y}`;
    });
    return path;
  }

  // BB fill path (area between upper and lower)
  function buildBBFillPath(): string {
    const upperPoints: string[] = [];
    const lowerPoints: string[] = [];
    bars.forEach((b, i) => {
      if (b.bbUpper == null || b.bbLower == null) return;
      const x = xScale(i);
      upperPoints.push(`${x},${yScale(b.bbUpper)}`);
      lowerPoints.push(`${x},${yScale(b.bbLower)}`);
    });
    if (upperPoints.length === 0) return '';
    return `M${upperPoints.join('L')}L${lowerPoints.reverse().join('L')}Z`;
  }

  const bbFillPath = buildBBFillPath();
  const bbUpperPath = buildLinePath((b) => b.bbUpper);
  const bbMiddlePath = buildLinePath((b) => b.bbMiddle);
  const bbLowerPath = buildLinePath((b) => b.bbLower);
  const sma20Path = buildLinePath((b) => b.sma20);
  const sma50Path = buildLinePath((b) => b.sma50);

  // Hovered bar data
  const hoveredBar = hoverIndex != null ? bars[hoverIndex] : null;

  return (
    <div className="bg-surface-card border border-edge rounded-lg p-5">
      {/* Header row: title + hover readout + period buttons */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-dim mb-1">Price History</h3>
          {/* Stationary hover readout */}
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
              {hoveredBar.bbUpper != null && (
                <>
                  <span><span className="text-[#4f8ff7]">BB</span> <span className="text-white">{hoveredBar.bbLower!.toFixed(2)}</span><span className="text-dim"> — </span><span className="text-white">{hoveredBar.bbUpper.toFixed(2)}</span></span>
                  <span><span className="text-[#ef4444]/70">Basis</span> <span className="text-white">{hoveredBar.bbMiddle!.toFixed(2)}</span></span>
                </>
              )}
            </div>
          ) : (
            <div className="text-xs text-dim/50 h-[18px]">Hover over chart for details</div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
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

      <div ref={containerRef} className="w-full relative" style={{ height: svgHeight }}>
        {containerWidth > 0 && (
          <svg
            width={dim.width}
            height={dim.height}
            className="select-none"
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Grid lines */}
            {yTicks.map((t) => (
              <line
                key={t}
                x1={dim.marginLeft}
                y1={yScale(t)}
                x2={dim.width - dim.marginRight}
                y2={yScale(t)}
                stroke="#2a2e3a"
                strokeDasharray="3 3"
              />
            ))}

            {/* Y-axis labels */}
            {yTicks.map((t) => (
              <text
                key={t}
                x={dim.marginLeft - 8}
                y={yScale(t)}
                fill="#8b8fa3"
                fontSize={11}
                textAnchor="end"
                dominantBaseline="middle"
              >
                ${t.toFixed(0)}
              </text>
            ))}

            {/* X-axis labels */}
            {bars.map((b, i) => {
              if (i % xTickEvery !== 0) return null;
              return (
                <text
                  key={i}
                  x={xScale(i)}
                  y={dim.height - 8}
                  fill="#8b8fa3"
                  fontSize={11}
                  textAnchor="middle"
                >
                  {formatDateShort(b.date)}
                </text>
              );
            })}

            {/* Bollinger Band fill */}
            {bbFillPath && (
              <path d={bbFillPath} fill="#4f8ff7" fillOpacity={0.07} />
            )}

            {/* Bollinger Band lines */}
            {bbUpperPath && (
              <path d={bbUpperPath} fill="none" stroke="#4f8ff7" strokeWidth={1} strokeDasharray="4 2" />
            )}
            {bbLowerPath && (
              <path d={bbLowerPath} fill="none" stroke="#4f8ff7" strokeWidth={1} strokeDasharray="4 2" />
            )}
            {bbMiddlePath && (
              <path d={bbMiddlePath} fill="none" stroke="#ef4444" strokeWidth={1} strokeOpacity={0.7} />
            )}

            {/* SMA 20 */}
            {sma20Path && (
              <path d={sma20Path} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
            )}

            {/* SMA 50 */}
            {sma50Path && (
              <path d={sma50Path} fill="none" stroke="#a855f7" strokeWidth={1.5} />
            )}

            {/* Candlesticks */}
            {bars.map((b, i) => {
              const cx = xScale(i);
              const isUp = b.close >= b.open;
              const color = isUp ? '#26a69a' : '#ef5350';
              const bodyTop = yScale(Math.max(b.open, b.close));
              const bodyBottom = yScale(Math.min(b.open, b.close));
              const bodyH = Math.max(1, bodyBottom - bodyTop);

              return (
                <g key={i}>
                  {/* Wick */}
                  <line
                    x1={cx}
                    y1={yScale(b.high)}
                    x2={cx}
                    y2={yScale(b.low)}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* Body */}
                  <rect
                    x={cx - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyH}
                    fill={color}
                    stroke={color}
                    strokeWidth={0.5}
                  />
                </g>
              );
            })}

            {/* Hover crosshair + invisible hit areas */}
            {bars.map((_, i) => (
              <rect
                key={i}
                x={xScale(i) - barWidth / 2}
                y={dim.marginTop}
                width={barWidth}
                height={dim.plotHeight}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
              />
            ))}

            {/* Crosshair */}
            {hoverIndex != null && (
              <>
                <line
                  x1={xScale(hoverIndex)}
                  y1={dim.marginTop}
                  x2={xScale(hoverIndex)}
                  y2={dim.marginTop + dim.plotHeight}
                  stroke="#8b8fa3"
                  strokeWidth={0.5}
                  strokeDasharray="4 2"
                />
              </>
            )}
          </svg>
        )}

      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5 mt-3 text-xs text-dim flex-wrap">
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
          <span className="w-4 h-0.5 inline-block" style={{ borderTop: '1px dashed #4f8ff7' }} /> BB (20, 2)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#ef4444]/70 inline-block" /> BB Basis
        </span>
      </div>
    </div>
  );
}
