import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../config/theme';
import { VolatilityMetrics, UpcomingEvent } from '../types/forecast';
import { api } from '../services/api';

interface Props {
  volatilityMetrics: VolatilityMetrics;
  ticker: string;
}

interface CheckItem {
  label: string;
  met: boolean;
  detail: string;
}

export default function PremiumChecklist({ volatilityMetrics: vm, ticker }: Props) {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    api.fetchEvents(ticker)
      .then((data) => { if (!cancelled) setEvents(data.events); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [ticker]);

  const hasCatalyst = events.some(e => e.type === 'earnings' || e.type === 'fomc');

  const sellChecks: CheckItem[] = [
    {
      label: 'IV Percentile >= 60%',
      met: vm.ivPercentile != null && vm.ivPercentile >= 60,
      detail: vm.ivPercentile != null ? `${vm.ivPercentile.toFixed(0)}%` : 'N/A',
    },
    {
      label: 'IV/RV Ratio >= 1.3x',
      met: vm.ivRvRatio != null && vm.ivRvRatio >= 1.3,
      detail: vm.ivRvRatio != null ? `${vm.ivRvRatio.toFixed(2)}x` : 'N/A',
    },
    {
      label: 'Vol Regime Normal or Compressed',
      met: vm.regime === 'normal' || vm.regime === 'compressed',
      detail: vm.regime,
    },
    {
      label: 'Premium Score >= 50',
      met: vm.premiumScore != null && vm.premiumScore >= 50,
      detail: vm.premiumScore != null ? `${vm.premiumScore.toFixed(0)}` : 'N/A',
    },
  ];

  const avoidChecks: CheckItem[] = [
    {
      label: 'IV Percentile < 25%',
      met: vm.ivPercentile != null && vm.ivPercentile < 25,
      detail: vm.ivPercentile != null ? `${vm.ivPercentile.toFixed(0)}%` : 'N/A',
    },
    {
      label: 'IV/RV Ratio < 1.0x',
      met: vm.ivRvRatio != null && vm.ivRvRatio < 1.0,
      detail: vm.ivRvRatio != null ? `${vm.ivRvRatio.toFixed(2)}x` : 'N/A',
    },
    {
      label: 'Vol Regime Extreme',
      met: vm.regime === 'extreme',
      detail: vm.regime,
    },
    {
      label: 'Upcoming catalyst (earnings/FOMC)',
      met: hasCatalyst,
      detail: hasCatalyst
        ? events.filter(e => e.type === 'earnings' || e.type === 'fomc').map(e => e.label).join(', ')
        : 'None in next 20 days',
    },
  ];

  const sellCount = sellChecks.filter(c => c.met).length;
  const avoidCount = avoidChecks.filter(c => c.met).length;

  return (
    <View style={styles.row}>
      {/* Sell Premium Box */}
      <View style={[styles.card, styles.cardHalf]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.green }]}>Sell Premium</Text>
          <Text style={styles.countLabel}>{sellCount}/4</Text>
        </View>
        {sellChecks.map((check, i) => (
          <View key={i} style={styles.checkRow}>
            <View style={[styles.checkbox, check.met && styles.checkboxMet]}>
              {check.met && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.checkContent}>
              <Text style={[styles.checkLabel, !check.met && styles.checkLabelDim]}>
                {check.label}
              </Text>
              <Text style={[styles.checkDetail, check.met ? { color: colors.green } : styles.checkDetailDim]}>
                {check.detail}
              </Text>
            </View>
          </View>
        ))}
        {sellCount >= 3 && (
          <Text style={[styles.verdict, { color: colors.green }]}>
            Conditions favorable for selling premium
          </Text>
        )}
      </View>

      {/* Avoid Selling Box */}
      <View style={[styles.card, styles.cardHalf]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.red }]}>Avoid Selling</Text>
          <Text style={styles.countLabel}>{avoidCount}/4</Text>
        </View>
        {avoidChecks.map((check, i) => (
          <View key={i} style={styles.checkRow}>
            <View style={[styles.checkbox, check.met && styles.checkboxAvoidMet]}>
              {check.met && <Text style={[styles.checkmark, { color: colors.red }]}>✓</Text>}
            </View>
            <View style={styles.checkContent}>
              <Text style={[styles.checkLabel, !check.met && styles.checkLabelDim]}>
                {check.label}
              </Text>
              <Text style={[styles.checkDetail, check.met ? { color: colors.red } : styles.checkDetailDim]}>
                {check.detail}
              </Text>
            </View>
          </View>
        ))}
        {avoidCount >= 2 && (
          <Text style={[styles.verdict, { color: colors.red }]}>
            Caution — red flags present
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHalf: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  countLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxMet: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderColor: colors.green,
  },
  checkboxAvoidMet: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: colors.red,
  },
  checkmark: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.green,
  },
  checkContent: {
    flex: 1,
  },
  checkLabel: {
    fontSize: 10,
    color: colors.text,
    lineHeight: 14,
  },
  checkLabelDim: {
    color: colors.textMuted,
  },
  checkDetail: {
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  checkDetailDim: {
    color: colors.textMuted,
  },
  verdict: {
    fontSize: 10,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
