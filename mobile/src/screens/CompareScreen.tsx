import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, spacing, fontSize } from '../config/theme';
import { useForecastStore } from '../store/forecastStore';
import { CompareTickerResult } from '../types/forecast';

function medalEmoji(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `#${rank}`;
}

function medalColor(rank: number): string {
  if (rank === 1) return '#FFD700';
  if (rank === 2) return '#C0C0C0';
  if (rank === 3) return '#CD7F32';
  return colors.textSecondary;
}

function RankCard({ item }: { item: CompareTickerResult }) {
  return (
    <View style={styles.rankCard}>
      <View style={styles.rankHeader}>
        <View style={styles.rankBadge}>
          <Text style={[styles.rankNumber, { color: medalColor(item.rank) }]}>
            {medalEmoji(item.rank)}
          </Text>
        </View>
        <Text style={styles.rankTicker}>{item.ticker}</Text>
        <Text style={styles.rankScore}>{item.compositeScore.toFixed(0)}</Text>
      </View>

      <View style={styles.rankRow}>
        <Text style={styles.rankLabel}>Spot</Text>
        <Text style={styles.rankValue}>${item.spot.toFixed(2)}</Text>
      </View>

      <View style={styles.rankRow}>
        <Text style={styles.rankLabel}>IV Percentile</Text>
        <Text style={styles.rankValue}>
          {item.ivPercentile !== null ? `${item.ivPercentile.toFixed(0)}%` : '—'}
        </Text>
      </View>

      <View style={styles.rankRow}>
        <Text style={styles.rankLabel}>IV/RV Ratio</Text>
        <Text style={styles.rankValue}>
          {item.ivRvRatio !== null ? item.ivRvRatio.toFixed(2) : '—'}
        </Text>
      </View>

      <View style={styles.rankRow}>
        <Text style={styles.rankLabel}>Regime</Text>
        <Text style={styles.rankValue}>{item.regime}</Text>
      </View>

      <View style={styles.rankRow}>
        <Text style={styles.rankLabel}>Premium</Text>
        <Text style={[styles.rankValue, {
          color: item.premiumLabel === 'Rich' ? colors.green
            : item.premiumLabel === 'Fair' ? colors.yellow
            : colors.red
        }]}>
          {item.premiumLabel || '—'}
        </Text>
      </View>

      <Text style={styles.verdict}>{item.verdict}</Text>
    </View>
  );
}

export default function CompareScreen() {
  const [input, setInput] = useState('');
  const { comparison, loading, error, fetchComparison } = useForecastStore();

  const handleSubmit = () => {
    const tickers = input
      .toUpperCase()
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tickers.length >= 2) {
      fetchComparison(tickers);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Compare Tickers</Text>
      <Text style={styles.subtitle}>Enter 2–10 tickers separated by commas</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="AAPL, MSFT, TSLA"
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
        />
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Compare</Text>
          )}
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {comparison?.comparison.tickers.map((item) => (
        <RankCard key={item.ticker} item={item} />
      ))}

      {comparison?.narrative && (
        <View style={styles.narrativeBox}>
          <Text style={styles.narrativeTitle}>AI Analysis</Text>
          <Text style={styles.narrativeText}>{comparison.narrative}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    height: 48,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#3b1818',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSize.sm,
  },
  rankCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  rankTicker: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  rankScore: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.accent,
  },
  rankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rankLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  rankValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  verdict: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  narrativeBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  narrativeTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: spacing.md,
  },
  narrativeText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
