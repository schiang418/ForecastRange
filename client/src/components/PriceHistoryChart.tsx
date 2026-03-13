import { useState, useEffect } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
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

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PriceHistoryChart({ ticker }: Props) {
  const [period, setPeriod] = useState<ChartPeriod>('6m');
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchChart(ticker, period)
      .then((data) => {
        if (!cancelled) setBars(data.bars);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

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

  // Prepare chart data - use close prices as the main line
  // For the BB band fill, we need the range
  const chartData = bars.map((bar) => ({
    ...bar,
    dateLabel: formatDate(bar.date),
    dateFull: formatDateFull(bar.date),
    // For candlestick coloring
    isUp: bar.close >= bar.open,
    // BB band range for area fill
    bbRange: bar.bbUpper != null && bar.bbLower != null ? [bar.bbLower, bar.bbUpper] : undefined,
  }));

  // Calculate Y domain from all price data + BB bands
  const allValues = chartData.flatMap((d) => {
    const vals = [d.high, d.low];
    if (d.bbUpper != null) vals.push(d.bbUpper);
    if (d.bbLower != null) vals.push(d.bbLower);
    return vals;
  });
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const padding = (dataMax - dataMin) * 0.03;
  const yMin = Math.floor((dataMin - padding) * 100) / 100;
  const yMax = Math.ceil((dataMax + padding) * 100) / 100;

  // Determine tick interval based on period
  const tickInterval = period === '3m' ? 5 : period === '6m' ? 10 : period === '1y' ? 20 : 40;

  return (
    <div className="bg-surface-card border border-edge rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-dim">Price History</h3>
        <div className="flex gap-1">
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

      <div className="w-full h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2e3a" />
            <XAxis
              dataKey="dateLabel"
              stroke="#8b8fa3"
              tick={{ fill: '#8b8fa3', fontSize: 11 }}
              interval={tickInterval}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              stroke="#8b8fa3"
              tick={{ fill: '#8b8fa3', fontSize: 11 }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1d27',
                border: '1px solid #2a2e3a',
                borderRadius: '8px',
                color: '#e1e4ea',
                fontSize: '12px',
              }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                const isUp = d.close >= d.open;
                const changeColor = isUp ? '#22c55e' : '#ef4444';
                const change = d.close - d.open;
                const changePct = ((change / d.open) * 100).toFixed(2);
                return (
                  <div className="bg-[#1a1d27] border border-[#2a2e3a] rounded-lg p-3 text-xs">
                    <div className="font-medium text-white mb-2">{d.dateFull}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-dim">Open</span>
                      <span className="text-right font-mono">${d.open.toFixed(2)}</span>
                      <span className="text-dim">High</span>
                      <span className="text-right font-mono">${d.high.toFixed(2)}</span>
                      <span className="text-dim">Low</span>
                      <span className="text-right font-mono">${d.low.toFixed(2)}</span>
                      <span className="text-dim">Close</span>
                      <span className="text-right font-mono" style={{ color: changeColor }}>
                        ${d.close.toFixed(2)} ({change >= 0 ? '+' : ''}{changePct}%)
                      </span>
                    </div>
                    {(d.sma20 != null || d.sma50 != null) && (
                      <div className="mt-2 pt-2 border-t border-[#2a2e3a] grid grid-cols-2 gap-x-4 gap-y-1">
                        {d.sma20 != null && (
                          <>
                            <span className="text-[#f59e0b]">SMA 20</span>
                            <span className="text-right font-mono">${d.sma20.toFixed(2)}</span>
                          </>
                        )}
                        {d.sma50 != null && (
                          <>
                            <span className="text-[#a855f7]">SMA 50</span>
                            <span className="text-right font-mono">${d.sma50.toFixed(2)}</span>
                          </>
                        )}
                      </div>
                    )}
                    {d.bbUpper != null && (
                      <div className="mt-2 pt-2 border-t border-[#2a2e3a] grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-[#4f8ff7]">BB Upper</span>
                        <span className="text-right font-mono">${d.bbUpper.toFixed(2)}</span>
                        <span className="text-[#4f8ff7]">BB Middle</span>
                        <span className="text-right font-mono">${d.bbMiddle.toFixed(2)}</span>
                        <span className="text-[#4f8ff7]">BB Lower</span>
                        <span className="text-right font-mono">${d.bbLower.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {/* Bollinger Band fill (shaded area between upper and lower) */}
            <Area
              type="monotone"
              dataKey="bbUpper"
              stroke="none"
              fill="#4f8ff7"
              fillOpacity={0.08}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="bbLower"
              stroke="none"
              fill="#1a1d27"
              fillOpacity={1}
              isAnimationActive={false}
            />

            {/* Bollinger Band lines */}
            <Line
              type="monotone"
              dataKey="bbUpper"
              stroke="#4f8ff7"
              strokeWidth={1}
              strokeDasharray="4 2"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="bbLower"
              stroke="#4f8ff7"
              strokeWidth={1}
              strokeDasharray="4 2"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="bbMiddle"
              stroke="#4f8ff7"
              strokeWidth={1}
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={false}
            />

            {/* Price line (close) colored by direction */}
            <Line
              type="monotone"
              dataKey="close"
              stroke="#e1e4ea"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* SMA 20 */}
            <Line
              type="monotone"
              dataKey="sma20"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />

            {/* SMA 50 */}
            <Line
              type="monotone"
              dataKey="sma50"
              stroke="#a855f7"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5 mt-3 text-xs text-dim flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#e1e4ea] inline-block" /> Close
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#f59e0b] inline-block" /> SMA 20
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-[#a855f7] inline-block" /> SMA 50
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 inline-block" style={{ borderTop: '1px dashed #4f8ff7' }} /> Bollinger Bands (20, 2)
        </span>
      </div>
    </div>
  );
}
