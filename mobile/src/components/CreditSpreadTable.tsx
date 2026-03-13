import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, spacing, fontSize } from '../config/theme';
import { CreditSpreadRow, CreditSpreadCell } from '../types/forecast';

interface Props {
  rows: CreditSpreadRow[];
  type: 'put' | 'call';
  spreadWidth: number;
}

function formatTargetDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const mon = date.toLocaleString('en-US', { month: 'short' });
  return `${mon} ${d}`;
}

function SpreadCellView({ cell, type }: { cell: CreditSpreadCell | null | undefined; type: 'put' | 'call' }) {
  if (!cell) {
    return <Text style={styles.naText}>N/A</Text>;
  }

  const label = type === 'put' ? 'P' : 'C';

  return (
    <View style={styles.cellContainer}>
      <Text style={styles.cellStrikes}>
        {cell.sellStrike}/{cell.buyStrike} {label}
      </Text>
      <Text style={[styles.cellPremium, cell.premium > 0 && { color: colors.green }]}>
        ${cell.premium.toFixed(2)}
        <Text style={styles.cellPerContract}> (${cell.premiumPerContract})</Text>
      </Text>
    </View>
  );
}

export default function CreditSpreadTable({ rows, type, spreadWidth }: Props) {
  const title = type === 'put' ? 'Sell Put Credit Spread' : 'Sell Call Credit Spread';
  const subtitle = type === 'put'
    ? `Sell put below range low, buy put $${spreadWidth} lower`
    : `Sell call above range high, buy call $${spreadWidth} higher`;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.horizonCol]}>Horizon</Text>
        <Text style={[styles.headerCell, styles.rangeCol]}>50%</Text>
        <Text style={[styles.headerCell, styles.rangeCol]}>68%</Text>
        <Text style={[styles.headerCell, styles.rangeCol]}>90%</Text>
      </View>

      {/* Rows */}
      {rows.map((row) => (
        <View key={row.horizon} style={styles.dataRow}>
          <View style={styles.horizonCol}>
            <Text style={styles.horizonText}>
              {row.targetDate ? `Fri ${formatTargetDate(row.targetDate)}` : row.horizon}
            </Text>
            <Text style={styles.daysText}>
              {row.horizonDays}d | ±${row.expectedMove.toFixed(1)} ({row.expectedMovePct.toFixed(1)}%)
            </Text>
          </View>
          <View style={styles.rangeCol}>
            <SpreadCellView cell={row.ranges.range50} type={type} />
          </View>
          <View style={styles.rangeCol}>
            <SpreadCellView cell={row.ranges.range68} type={type} />
          </View>
          <View style={styles.rangeCol}>
            <SpreadCellView cell={row.ranges.range90} type={type} />
          </View>
        </View>
      ))}
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
  title: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerCell: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  horizonCol: {
    flex: 2,
  },
  rangeCol: {
    flex: 2,
    alignItems: 'flex-end',
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,45,58,0.5)',
  },
  horizonText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.accent,
  },
  daysText: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 1,
  },
  naText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  cellContainer: {
    alignItems: 'flex-end',
  },
  cellStrikes: {
    fontSize: 9,
    color: colors.textMuted,
  },
  cellPremium: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  cellPerContract: {
    fontSize: 9,
    color: colors.textMuted,
  },
});
