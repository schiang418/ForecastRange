import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SmaDeviationResult, SmaDeviationSingle } from '../types/forecast';
import { colors, spacing, fontSize } from '../config/theme';

interface DeviationCardProps {
  deviation: SmaDeviationResult | null;
  loading: boolean;
  error: string | null;
}

function zoneColor(zone: string): string {
  if (zone.includes('EXTREMELY')) return colors.red;
  if (zone.includes('VERY_EXTENDED')) return colors.orange;
  if (zone === 'EXTENDED') return colors.yellow;
  if (zone === 'NORMAL') return colors.green;
  if (zone === 'COMPRESSED') return colors.yellow;
  if (zone.includes('VERY_COMPRESSED')) return colors.orange;
  return colors.text;
}

function zoneLabel(zone: string): string {
  return zone.replace(/_/g, ' ');
}

function deviationColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 10) return colors.red;
  if (abs >= 5) return colors.orange;
  if (abs >= 2) return colors.yellow;
  return colors.green;
}

function percentileColor(rank: number): string {
  if (rank >= 90) return colors.red;
  if (rank >= 75) return colors.orange;
  if (rank >= 50) return colors.yellow;
  return colors.green;
}

function SmaRow({ label, sma }: { label: string; sma: SmaDeviationSingle }) {
  const dir = sma.deviationPct >= 0 ? '+' : '';
  const arrow = sma.deviationPct >= 0 ? '\u25B2' : '\u25BC';

  return (
    <View style={styles.smaSection}>
      <View style={styles.smaHeader}>
        <Text style={styles.smaLabel}>{label}</Text>
        <Text style={[styles.smaBadge, { backgroundColor: zoneColor(sma.extension.zone) + '22', color: zoneColor(sma.extension.zone) }]}>
          {zoneLabel(sma.extension.zone)}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>SMA Value</Text>
        <Text style={styles.value}>${sma.value.toFixed(2)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Deviation</Text>
        <Text style={[styles.value, { color: deviationColor(sma.deviationPct) }]}>
          {arrow} {dir}{sma.deviationPct.toFixed(2)}% ({dir}${sma.deviationDollars.toFixed(2)})
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Percentile Rank</Text>
        <Text style={[styles.value, { color: percentileColor(sma.percentileRank) }]}>
          {sma.percentileRank.toFixed(1)}%
        </Text>
      </View>

      <Text style={[styles.frequencyLabel, { color: percentileColor(sma.percentileRank) }]}>
        {sma.frequencyLabel}
      </Text>

      <Text style={styles.percentileHint}>
        More extreme than {sma.percentileRank.toFixed(0)}% of {sma.tradingDaysAnalyzed} trading days ({sma.approxYears}yr)
      </Text>
    </View>
  );
}

export default function DeviationCard({ deviation, loading, error }: DeviationCardProps) {
  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Analyzing SMA deviation...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>SMA Deviation</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!deviation) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>SMA Deviation Analysis</Text>

      {deviation.sma20 && <SmaRow label="20-Day SMA" sma={deviation.sma20} />}

      {deviation.sma20 && deviation.sma50 && <View style={styles.divider} />}

      {deviation.sma50 && <SmaRow label="50-Day SMA" sma={deviation.sma50} />}

      {deviation.interpretation && (
        <>
          <View style={styles.divider} />
          <Text style={styles.interpretation}>{deviation.interpretation}</Text>
        </>
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
  smaSection: {
    marginBottom: spacing.xs,
  },
  smaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  smaLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  smaBadge: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
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
    fontFamily: 'monospace',
  },
  frequencyLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  percentileHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  interpretation: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSize.sm,
  },
});
