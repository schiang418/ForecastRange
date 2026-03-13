import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VolatilityMetrics } from '../types/forecast';
import { colors, spacing, fontSize } from '../config/theme';

interface VolatilityCardProps {
  metrics: VolatilityMetrics;
}

function regimeColor(regime: string): string {
  if (regime === 'Compressed') return colors.green;
  if (regime === 'Normal') return colors.text;
  if (regime === 'Elevated') return colors.orange;
  return colors.red; // Extreme
}

function numFormat(v: number | null, decimals = 2): string {
  if (v === null) return '—';
  return v.toFixed(decimals);
}

export default function VolatilityCard({ metrics }: VolatilityCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Volatility</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Regime</Text>
        <Text style={[styles.value, { color: regimeColor(metrics.regime) }]}>
          {metrics.regime}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Current IV</Text>
        <Text style={styles.value}>
          {metrics.currentIVPct != null ? `${metrics.currentIVPct.toFixed(1)}%` : '—'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>RV (20d)</Text>
        <Text style={styles.value}>{metrics.rv20AnnualizedPct.toFixed(1)}%</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>IV/RV Ratio</Text>
        <Text style={styles.value}>{numFormat(metrics.ivRvRatio)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Vol Premium</Text>
        <Text style={[styles.value, {
          color: metrics.volPremium !== null && metrics.volPremium > 0 ? colors.green : colors.red
        }]}>
          {metrics.volPremium !== null ? `${metrics.volPremium.toFixed(1)}pp` : '—'}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.label}>IV Percentile</Text>
        <Text style={styles.value}>
          {metrics.ivPercentile !== null ? `${metrics.ivPercentile.toFixed(0)}%` : '—'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>IV Rank</Text>
        <Text style={styles.value}>
          {metrics.ivRank !== null ? `${metrics.ivRank.toFixed(0)}%` : '—'}
        </Text>
      </View>

      {metrics.premiumLabel && (
        <View style={styles.row}>
          <Text style={styles.label}>Premium Rating</Text>
          <Text style={[styles.value, {
            color: metrics.premiumLabel === 'Rich' ? colors.green
              : metrics.premiumLabel === 'Fair' ? colors.yellow
              : colors.red
          }]}>
            {metrics.premiumLabel} ({metrics.premiumScore !== null ? metrics.premiumScore.toFixed(0) : '—'})
          </Text>
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
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
