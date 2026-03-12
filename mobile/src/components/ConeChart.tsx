import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Rect } from 'react-native-svg';
import { ForecastHorizon } from '../types/forecast';
import { colors, spacing, fontSize } from '../config/theme';

interface ConeChartProps {
  horizons: ForecastHorizon[];
  spot: number;
}

export default function ConeChart({ horizons, spot }: ConeChartProps) {
  const width = Dimensions.get('window').width - spacing.xxl * 2;
  const height = 220;
  const padding = { top: 20, bottom: 30, left: 55, right: 15 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Data points: spot + 4 horizons
  const points = [
    { x: 0, center: spot, low90: spot, high90: spot, low68: spot, high68: spot, low50: spot, high50: spot },
    ...horizons.map((h, i) => ({
      x: i + 1,
      center: h.center,
      low90: h.range90.low,
      high90: h.range90.high,
      low68: h.range68.low,
      high68: h.range68.high,
      low50: h.range50.low,
      high50: h.range50.high,
    })),
  ];

  const allValues = points.flatMap((p) => [p.low90, p.high90]);
  const minY = Math.min(...allValues) * 0.998;
  const maxY = Math.max(...allValues) * 1.002;

  const scaleX = (v: number) => padding.left + (v / (points.length - 1)) * chartW;
  const scaleY = (v: number) => padding.top + chartH - ((v - minY) / (maxY - minY)) * chartH;

  const makeAreaPath = (lows: number[], highs: number[]) => {
    const topPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.x)},${scaleY(highs[i])}`).join(' ');
    const bottomPath = [...points].reverse().map((p, i) => `L${scaleX(p.x)},${scaleY(lows[points.length - 1 - i])}`).join(' ');
    return `${topPath} ${bottomPath} Z`;
  };

  const path90 = makeAreaPath(points.map(p => p.low90), points.map(p => p.high90));
  const path68 = makeAreaPath(points.map(p => p.low68), points.map(p => p.high68));
  const path50 = makeAreaPath(points.map(p => p.low50), points.map(p => p.high50));

  const centerLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(p.x)},${scaleY(p.center)}`).join(' ');

  // Y-axis labels
  const yTicks = 5;
  const yStep = (maxY - minY) / yTicks;

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        {/* Background */}
        <Rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill={colors.surface} rx={4} />

        {/* Grid lines */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = minY + i * yStep;
          const y = scaleY(val);
          return (
            <React.Fragment key={i}>
              <Line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={colors.border} strokeWidth={0.5} />
              <SvgText x={padding.left - 5} y={y + 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
                {val.toFixed(0)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Bands */}
        <Path d={path90} fill={colors.accent} opacity={0.1} />
        <Path d={path68} fill={colors.accent} opacity={0.2} />
        <Path d={path50} fill={colors.accent} opacity={0.3} />

        {/* Center line */}
        <Path d={centerLine} stroke={colors.accent} strokeWidth={2} fill="none" />

        {/* X-axis labels */}
        <SvgText x={scaleX(0)} y={height - 5} fontSize={10} fill={colors.textMuted} textAnchor="middle">Now</SvgText>
        {horizons.map((h, i) => (
          <SvgText key={i} x={scaleX(i + 1)} y={height - 5} fontSize={10} fill={colors.textMuted} textAnchor="middle">
            {h.horizon}
          </SvgText>
        ))}
      </Svg>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent, opacity: 0.3 }]} />
          <Text style={styles.legendText}>50%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent, opacity: 0.2 }]} />
          <Text style={styles.legendText}>68%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.accent, opacity: 0.1 }]} />
          <Text style={styles.legendText}>90%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
