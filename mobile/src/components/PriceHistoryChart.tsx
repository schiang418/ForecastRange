import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Dimensions, ActivityIndicator,
  Pressable, ScrollView,
} from 'react-native';
import Svg, {
  Line, Rect, Path, Text as SvgText, G,
} from 'react-native-svg';
import { colors, spacing, fontSize } from '../config/theme';
import { api } from '../services/api';
import { ChartBar, ChartMarker, ChartPeriod } from '../types/forecast';

interface Props {
  ticker: string;
}

const PERIODS: { value: ChartPeriod; label: string }[] = [
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
];

function niceStep(range: number, targetTicks: number): number {
  const rawStep = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PriceHistoryChart({ ticker }: Props) {
  const [period, setPeriod] = useState<ChartPeriod>('6m');
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [markers, setMarkers] = useState<ChartMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.fetchChart(ticker, period)
      .then((data) => {
        if (cancelled) return;
        setBars(data.bars);
        setMarkers(data.markers ?? []);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, period]);

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Loading price history...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (bars.length === 0) return null;

  // Layout
  const screenWidth = Dimensions.get('window').width - spacing.lg * 2;
  const marginLeft = 55;
  const marginRight = 10;
  const marginTop = 10;
  const priceHeight = 220;
  const gapHeight = 6;
  const rsiHeight = 60;
  const marginBottom = 25;
  const totalWidth = screenWidth;
  const totalHeight = marginTop + priceHeight + gapHeight + rsiHeight + marginBottom;
  const plotWidth = totalWidth - marginLeft - marginRight;

  // X scale
  const barW = plotWidth / bars.length;
  const candleW = Math.max(1.5, Math.min(8, barW * 0.7));
  const xScale = (i: number) => marginLeft + i * barW + barW / 2;

  // Price Y scale
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

  // Price ticks
  const pStep = niceStep(pYMax - pYMin, 6);
  const priceTicks: number[] = [];
  for (let t = Math.ceil(pYMin / pStep) * pStep; t <= pYMax; t += pStep) {
    priceTicks.push(t);
  }

  // RSI Y scale
  const rsiTop = marginTop + priceHeight + gapHeight;
  const rsiYScale = (v: number) => rsiTop + rsiHeight * (1 - v / 100);

  // X ticks
  const xTickEvery = bars.length <= 65 ? 10 : bars.length <= 130 ? 20 : 40;

  // Path builders
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
  const bbLowerPath = buildPricePath((b) => b.bbLower);
  const sma20Path = buildPricePath((b) => b.sma20);
  const sma50Path = buildPricePath((b) => b.sma50);
  const sma200Path = buildPricePath((b) => b.sma200);
  const rsiPath = buildRSIPath();
  const closePath = buildPricePath((b) => b.close);

  // Marker placement: map date → bar index so we can position diamonds above
  // the right bar without depending on equal spacing assumptions.
  const dateToIdx = new Map<string, number>();
  bars.forEach((b, i) => dateToIdx.set(b.date, i));
  const placedMarkers = markers
    .map((m) => {
      const idx = dateToIdx.get(m.date);
      if (idx == null) return null;
      return { ...m, idx };
    })
    .filter((m): m is ChartMarker & { idx: number } => m != null);

  // Latest bar info
  const latest = bars[bars.length - 1];
  const isUp = latest.close >= latest.open;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>Price History</Text>
        <View style={styles.controls}>
          <Pressable
            style={[styles.controlBtn, chartType === 'line' && styles.controlBtnActive]}
            onPress={() => setChartType(chartType === 'candle' ? 'line' : 'candle')}
          >
            <Text style={[styles.controlText, chartType === 'line' && styles.controlTextActive]}>
              {chartType === 'candle' ? 'Line' : 'Candle'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.value}
            style={[styles.periodBtn, period === p.value && styles.periodBtnActive]}
            onPress={() => setPeriod(p.value)}
          >
            <Text style={[styles.periodText, period === p.value && styles.periodTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Latest bar info */}
      <View style={styles.latestRow}>
        <Text style={styles.latestDate}>{formatDateShort(latest.date)}</Text>
        <Text style={[styles.latestPrice, { color: isUp ? '#26a69a' : '#ef5350' }]}>
          ${latest.close.toFixed(2)}
        </Text>
        {latest.rsi14 != null && (
          <Text style={styles.latestRsi}>RSI {latest.rsi14.toFixed(0)}</Text>
        )}
      </View>

      {/* Chart */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={totalWidth} height={totalHeight}>
          {/* Grid lines */}
          {priceTicks.map((t) => (
            <Line key={t} x1={marginLeft} y1={priceYScale(t)} x2={totalWidth - marginRight} y2={priceYScale(t)} stroke="#2a2e3a" strokeDasharray="3 3" />
          ))}

          {/* Y-axis labels */}
          {priceTicks.map((t) => (
            <SvgText key={`l${t}`} x={marginLeft - 6} y={priceYScale(t) + 3} fill="#8b8fa3" fontSize={9} textAnchor="end">
              ${t.toFixed(0)}
            </SvgText>
          ))}

          {/* Bollinger Band fill */}
          {bbFillPath ? <Path d={bbFillPath} fill="#4f8ff7" fillOpacity={0.07} /> : null}
          {bbUpperPath ? <Path d={bbUpperPath} fill="none" stroke="#4f8ff7" strokeWidth={0.8} strokeDasharray="4 2" /> : null}
          {bbLowerPath ? <Path d={bbLowerPath} fill="none" stroke="#4f8ff7" strokeWidth={0.8} strokeDasharray="4 2" /> : null}

          {/* SMA lines */}
          {sma20Path ? <Path d={sma20Path} fill="none" stroke="#f59e0b" strokeWidth={1.2} /> : null}
          {sma50Path ? <Path d={sma50Path} fill="none" stroke="#a855f7" strokeWidth={1.2} /> : null}
          {sma200Path ? <Path d={sma200Path} fill="none" stroke="#06b6d4" strokeWidth={1.2} strokeDasharray="4 2" /> : null}

          {/* Price data */}
          {chartType === 'candle' ? (
            bars.map((b, i) => {
              const cx = xScale(i);
              const up = b.close >= b.open;
              const color = up ? '#26a69a' : '#ef5350';
              const bodyTop = priceYScale(Math.max(b.open, b.close));
              const bodyH = Math.max(0.5, priceYScale(Math.min(b.open, b.close)) - bodyTop);
              return (
                <G key={i}>
                  <Line x1={cx} y1={priceYScale(b.high)} x2={cx} y2={priceYScale(b.low)} stroke={color} strokeWidth={0.8} />
                  <Rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} />
                </G>
              );
            })
          ) : (
            closePath ? <Path d={closePath} fill="none" stroke="#26a69a" strokeWidth={1.5} /> : null
          )}

          {/* MRC top markers (watch + confirmed) */}
          {placedMarkers.map((m, k) => {
            const cx = xScale(m.idx);
            const cy = priceYScale(m.price) - 10;
            const size = m.type === 'confirmed' ? 5 : 4;
            const d = `M ${cx} ${cy - size} L ${cx + size} ${cy} L ${cx} ${cy + size} L ${cx - size} ${cy} Z`;
            const fill = m.type === 'confirmed' ? '#a855f7' : 'transparent';
            const stroke = m.type === 'confirmed' ? '#a855f7' : '#eab308';
            return (
              <Path
                key={`mk${k}`}
                d={d}
                fill={fill}
                stroke={stroke}
                strokeWidth={m.type === 'confirmed' ? 0.8 : 1.4}
              />
            );
          })}

          {/* RSI separator */}
          <Line x1={marginLeft} y1={rsiTop} x2={totalWidth - marginRight} y2={rsiTop} stroke="#2a2e3a" strokeWidth={0.5} />

          {/* RSI zones */}
          <Rect x={marginLeft} y={rsiYScale(100)} width={plotWidth} height={rsiYScale(70) - rsiYScale(100)} fill="#ef5350" fillOpacity={0.06} />
          <Rect x={marginLeft} y={rsiYScale(30)} width={plotWidth} height={rsiYScale(0) - rsiYScale(30)} fill="#26a69a" fillOpacity={0.06} />

          {/* RSI guide lines */}
          <Line x1={marginLeft} y1={rsiYScale(70)} x2={totalWidth - marginRight} y2={rsiYScale(70)} stroke="#ef5350" strokeWidth={0.5} strokeDasharray="3 3" strokeOpacity={0.5} />
          <Line x1={marginLeft} y1={rsiYScale(30)} x2={totalWidth - marginRight} y2={rsiYScale(30)} stroke="#26a69a" strokeWidth={0.5} strokeDasharray="3 3" strokeOpacity={0.5} />

          {/* RSI labels */}
          <SvgText x={marginLeft - 6} y={rsiYScale(70) + 3} fill="#ef5350" fontSize={8} textAnchor="end" fillOpacity={0.6}>70</SvgText>
          <SvgText x={marginLeft - 6} y={rsiYScale(30) + 3} fill="#26a69a" fontSize={8} textAnchor="end" fillOpacity={0.6}>30</SvgText>

          {/* RSI line */}
          {rsiPath ? <Path d={rsiPath} fill="none" stroke="#eab308" strokeWidth={1.2} /> : null}

          {/* X-axis labels */}
          {bars.map((b, i) => {
            if (i % xTickEvery !== 0) return null;
            return (
              <SvgText key={`x${i}`} x={xScale(i)} y={totalHeight - 6} fill="#8b8fa3" fontSize={9} textAnchor="middle">
                {formatDateShort(b.date)}
              </SvgText>
            );
          })}
        </Svg>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legendRow}>
        <Text style={[styles.legendItem, { color: '#f59e0b' }]}>SMA20</Text>
        <Text style={[styles.legendItem, { color: '#a855f7' }]}>SMA50</Text>
        <Text style={[styles.legendItem, { color: '#06b6d4' }]}>SMA200</Text>
        <Text style={[styles.legendItem, { color: '#4f8ff7' }]}>BB</Text>
        <Text style={[styles.legendItem, { color: '#eab308' }]}>RSI</Text>
        <Text style={[styles.legendItem, { color: '#eab308' }]}>◇ Watch</Text>
        <Text style={[styles.legendItem, { color: '#a855f7' }]}>◆ Top</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 200,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSize.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  controlBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
  },
  controlBtnActive: {
    backgroundColor: colors.accent,
  },
  controlText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  controlTextActive: {
    color: colors.white,
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  periodBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
  },
  periodBtnActive: {
    backgroundColor: colors.accent,
  },
  periodText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  periodTextActive: {
    color: colors.white,
  },
  latestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  latestDate: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  latestPrice: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  latestRsi: {
    fontSize: fontSize.xs,
    color: '#eab308',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
});
