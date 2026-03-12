import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ForecastHorizon } from '../types/forecast';
import { colors, spacing, fontSize } from '../config/theme';

interface HorizonCardProps {
  horizon: ForecastHorizon;
}

function formatPrice(n: number): string {
  return n.toFixed(2);
}

function skewColor(skew: string): string {
  if (skew === 'bullish') return colors.green;
  if (skew === 'bearish') return colors.red;
  return colors.yellow;
}

function confidenceColor(label: string): string {
  if (label === 'High') return colors.green;
  if (label === 'Moderate') return colors.yellow;
  return colors.red;
}

export default function HorizonCard({ horizon }: HorizonCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{horizon.horizon}</Text>
        <Text style={[styles.skew, { color: skewColor(horizon.skew) }]}>
          {horizon.skew}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Center</Text>
        <Text style={styles.value}>${formatPrice(horizon.center)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Expected Move</Text>
        <Text style={styles.value}>
          ${formatPrice(horizon.expectedMove)} ({(horizon.expectedMovePct * 100).toFixed(1)}%)
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.label}>90% Range</Text>
        <Text style={styles.value}>
          ${formatPrice(horizon.range90.low)} – ${formatPrice(horizon.range90.high)}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>68% Range</Text>
        <Text style={styles.value}>
          ${formatPrice(horizon.range68.low)} – ${formatPrice(horizon.range68.high)}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>50% Range</Text>
        <Text style={styles.value}>
          ${formatPrice(horizon.range50.low)} – ${formatPrice(horizon.range50.high)}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.label}>Confidence</Text>
        <Text style={[styles.value, { color: confidenceColor(horizon.confidenceLabel) }]}>
          {horizon.confidenceLabel} ({(horizon.confidence * 100).toFixed(0)}%)
        </Text>
      </View>

      {horizon.targetDate && (
        <View style={styles.row}>
          <Text style={styles.label}>Target Date</Text>
          <Text style={styles.valueSmall}>{horizon.targetDate}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  skew: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  value: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  valueSmall: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
