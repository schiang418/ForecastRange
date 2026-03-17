import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform } from 'react-native';
import { ForecastHorizon } from '../types/forecast';
import { computeTargetPercentile } from '../utils/percentile';
import { colors, spacing, fontSize } from '../config/theme';

interface Props {
  horizons: ForecastHorizon[];
  spot: number;
}

function formatTargetDate(dateStr: string | null, days: number): string {
  if (!dateStr) return `${days}d`;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const mon = date.toLocaleString('en-US', { month: 'short' });
  return `Fri ${mon} ${d} (${days}d)`;
}

function percentileColor(pct: number): string {
  if (pct <= 50) return colors.green;
  if (pct <= 68) return colors.yellow;
  if (pct <= 90) return colors.orange;
  return colors.red;
}

function sideColor(side: string): string {
  if (side === 'above') return colors.green;
  if (side === 'below') return colors.red;
  return colors.textMuted;
}

export default function TargetPricePercentile({ horizons, spot }: Props) {
  const [inputValue, setInputValue] = useState('');
  const targetPrice = (() => {
    const num = parseFloat(inputValue);
    return !isNaN(num) && num > 0 ? num : null;
  })();

  const results = targetPrice
    ? horizons.map((h) => ({
        horizon: h,
        ...computeTargetPercentile(targetPrice, h.center, h.expectedMove),
      }))
    : null;

  const diffLabel = targetPrice
    ? targetPrice > spot
      ? `+$${(targetPrice - spot).toFixed(2)} (+${(((targetPrice - spot) / spot) * 100).toFixed(1)}%) above spot`
      : targetPrice < spot
      ? `-$${(spot - targetPrice).toFixed(2)} (-${(((spot - targetPrice) / spot) * 100).toFixed(1)}%) below spot`
      : 'at spot'
    : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>◎ Target Price Percentile Lookup</Text>
      <Text style={styles.subtitle}>
        Enter a price target to see what percentile band it falls at for each horizon.
      </Text>

      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder={spot.toFixed(2)}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
        </View>
        {diffLabel && <Text style={styles.diffLabel}>{diffLabel}</Text>}
      </View>

      {results && (
        <>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.horizonCol]}>Horizon</Text>
            <Text style={[styles.headerCell, styles.sigmaCol]}>Sigma</Text>
            <Text style={[styles.headerCell, styles.bandCol]}>Band %ile</Text>
            <Text style={[styles.headerCell, styles.sideCol]}>Side</Text>
            <Text style={[styles.headerCell, styles.reachCol]}>P(reach)</Text>
          </View>

          {/* Table Rows */}
          {results.map((r) => (
            <View key={r.horizon.horizon} style={styles.tableRow}>
              <Text style={[styles.cellAccent, styles.horizonCol]} numberOfLines={1}>
                {formatTargetDate(r.horizon.targetDate, r.horizon.horizonDays)}
              </Text>
              <Text style={[styles.cellMono, styles.sigmaCol]}>
                {r.sigma.toFixed(2)}σ
              </Text>
              <Text
                style={[
                  styles.cellMono,
                  styles.cellBold,
                  styles.bandCol,
                  { color: percentileColor(r.percentile) },
                ]}
              >
                {r.percentile.toFixed(1)}%
              </Text>
              <Text style={[styles.cellCenter, styles.sideCol, { color: sideColor(r.side) }]}>
                {r.side === 'above' ? '↑ above' : r.side === 'below' ? '↓ below' : '— center'}
              </Text>
              <Text style={[styles.cellMono, styles.reachCol]}>
                {r.probBeyond.toFixed(1)}%
              </Text>
            </View>
          ))}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              <Text style={styles.footerBold}>Band %ile</Text> — probability the price stays within
              ±${targetPrice && results[0] ? Math.abs(targetPrice - results[0].horizon.center).toFixed(2) : '...'} of the forecast center. Compare: 50% band, 68% band, 90% band.
            </Text>
            <Text style={styles.footerText}>
              <Text style={styles.footerBold}>P(reach)</Text> — chance of the price reaching ${targetPrice?.toFixed(2)} or beyond on that side.
            </Text>
          </View>
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
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  dollarSign: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  input: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    minWidth: 80,
    height: 40,
    padding: 0,
  },
  diffLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    flexShrink: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  headerCell: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  horizonCol: { flex: 3 },
  sigmaCol: { flex: 2, textAlign: 'right' },
  bandCol: { flex: 2, textAlign: 'right' },
  sideCol: { flex: 2, textAlign: 'center' },
  reachCol: { flex: 2, textAlign: 'right' },
  cellAccent: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.accent,
  },
  cellMono: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cellBold: {
    fontWeight: '600',
  },
  cellCenter: {
    fontSize: fontSize.xs,
  },
  footer: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
  footerBold: {
    fontWeight: '700',
  },
});
