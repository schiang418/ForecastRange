import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { colors, spacing, fontSize } from '../config/theme';
import { useForecastStore } from '../store/forecastStore';
import { CompareTickerResult } from '../types/forecast';
import { saveAnalysisAsMarkdown } from '../utils/saveAnalysis';

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

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={barStyles.value}>{value.toFixed(0)}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  label: { fontSize: 9, color: colors.textMuted, width: 50 },
  track: { flex: 1, height: 6, backgroundColor: colors.surfaceLight, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  value: { fontSize: 9, color: colors.textSecondary, width: 24, textAlign: 'right', fontFamily: 'monospace' },
});

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

      {item.weekMove != null && (
        <View style={styles.rankRow}>
          <Text style={styles.rankLabel}>1W Move</Text>
          <Text style={styles.rankValue}>
            ±{(item.weekMove * 100).toFixed(1)}%
            {item.weekSkew ? ` (${item.weekSkew})` : ''}
          </Text>
        </View>
      )}

      {/* Composite Score Breakdown */}
      {item.compositeComponents && (
        <View style={styles.scoreBreakdown}>
          <ScoreBar label="Premium" value={item.compositeComponents.premiumScore} max={40} />
          <ScoreBar label="IV/RV" value={item.compositeComponents.ivRvScore} max={25} />
          <ScoreBar label="IV Pct" value={item.compositeComponents.ivPctScore} max={25} />
          <ScoreBar label="Regime" value={item.compositeComponents.regimeScore} max={10} />
        </View>
      )}

      <Text style={styles.verdict}>{item.verdict}</Text>
    </View>
  );
}

export default function CompareScreen() {
  const [input, setInput] = useState('');
  const {
    comparison, loading, error, fetchComparison, fetchNarrative, narrativeLoading,
    fetchPremiumNarrative, premiumNarrative, premiumNarrativeLoading,
    premiumNarrativeError, premiumNarrativeProgress,
  } = useForecastStore();

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

      {/* Best Pick Banner */}
      {comparison?.comparison.bestPick && (
        <View style={styles.bestPickBanner}>
          <Text style={styles.bestPickLabel}>Best Pick for Premium Selling</Text>
          <Text style={styles.bestPickTicker}>{comparison.comparison.bestPick}</Text>
        </View>
      )}

      {comparison?.comparison.tickers.map((item) => (
        <RankCard key={item.ticker} item={item} />
      ))}

      {/* AI Narrative */}
      {comparison && (
        <>
          {!comparison.narrative && !narrativeLoading && (
            <Pressable
              style={styles.narrativeButton}
              onPress={() => fetchNarrative(comparison)}
            >
              <Text style={styles.narrativeButtonText}>Generate AI Narrative</Text>
            </Pressable>
          )}

          {narrativeLoading && (
            <View style={styles.narrativeLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.narrativeLoadingText}>Generating AI narrative...</Text>
            </View>
          )}

          {comparison.narrative && (
            <View style={styles.narrativeBox}>
              <View style={styles.narrativeHeader}>
                <Text style={styles.narrativeTitle}>AI Analysis</Text>
                <View style={styles.narrativeActions}>
                  <Pressable
                    style={styles.saveBtn}
                    onPress={() => saveAnalysisAsMarkdown(
                      `AI Comparison Analysis - ${comparison.comparison.tickers.map(t => t.ticker).join(' vs ')}`,
                      comparison.narrative!,
                      `compare_${comparison.comparison.tickers.map(t => t.ticker).join('_')}_analysis`,
                    )}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </Pressable>
                  <Pressable
                    style={styles.regenerateBtn}
                    onPress={() => fetchNarrative(comparison)}
                    disabled={narrativeLoading}
                  >
                    <Text style={styles.regenerateText}>Regenerate</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.narrativeText}>{comparison.narrative}</Text>
            </View>
          )}
        </>
      )}

      {/* Premium-Aware AI Analysis */}
      {comparison && (
        <>
          <Pressable
            style={[styles.premiumNarrativeButton, premiumNarrativeLoading && styles.buttonDisabled]}
            onPress={() => fetchPremiumNarrative(comparison)}
            disabled={premiumNarrativeLoading}
          >
            {premiumNarrativeLoading ? (
              <View style={styles.premiumNarrativeButtonInner}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.premiumNarrativeButtonText}>
                  {premiumNarrativeProgress || 'Working...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.premiumNarrativeButtonText}>
                {premiumNarrative ? 'Refresh Analysis with Pricing' : 'Analyze with Pricing'}
              </Text>
            )}
          </Pressable>
          <Text style={styles.premiumNarrativeHint}>
            Compare tickers using real credit spread premiums from live option pricing
          </Text>

          {premiumNarrativeError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{premiumNarrativeError}</Text>
            </View>
          )}

          {premiumNarrative && (
            <View style={styles.premiumNarrativeBox}>
              <View style={styles.narrativeHeader}>
                <Text style={styles.premiumNarrativeTitle}>Premium-Aware AI Analysis</Text>
                <View style={styles.narrativeActions}>
                  <Pressable
                    style={styles.saveBtn}
                    onPress={() => saveAnalysisAsMarkdown(
                      `Premium-Aware Comparison Analysis - ${comparison.comparison.tickers.map(t => t.ticker).join(' vs ')}`,
                      premiumNarrative,
                      `compare_${comparison.comparison.tickers.map(t => t.ticker).join('_')}_premium_analysis`,
                    )}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </Pressable>
                  <Pressable
                    style={styles.regenerateBtn}
                    onPress={() => fetchPremiumNarrative(comparison)}
                    disabled={premiumNarrativeLoading}
                  >
                    <Text style={styles.regenerateText}>Regenerate</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.narrativeText}>{premiumNarrative}</Text>
            </View>
          )}
        </>
      )}

      {/* Failed tickers */}
      {comparison?.failed && comparison.failed.length > 0 && (
        <View style={styles.failedBox}>
          <Text style={styles.failedTitle}>Failed</Text>
          {comparison.failed.map((f) => (
            <Text key={f.ticker} style={styles.failedText}>
              {f.ticker}: {f.error}
            </Text>
          ))}
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
  bestPickBanner: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  bestPickLabel: {
    fontSize: fontSize.xs,
    color: colors.green,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  bestPickTicker: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.green,
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
  scoreBreakdown: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  verdict: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  narrativeButton: {
    height: 48,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.md,
  },
  narrativeButtonText: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  narrativeLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  narrativeLoadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  narrativeBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  narrativeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  narrativeTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.accent,
  },
  regenerateBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
  },
  regenerateText: {
    fontSize: fontSize.xs,
    color: colors.accent,
    fontWeight: '600',
  },
  narrativeText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  premiumNarrativeButton: {
    height: 48,
    backgroundColor: colors.green,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  premiumNarrativeButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  premiumNarrativeButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  premiumNarrativeHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  premiumNarrativeBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.green,
  },
  premiumNarrativeTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.green,
  },
  narrativeActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  saveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  saveBtnText: {
    fontSize: fontSize.xs,
    color: colors.accent,
    fontWeight: '600',
  },
  failedBox: {
    backgroundColor: '#3b1818',
    borderRadius: 8,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  failedTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.red,
    marginBottom: spacing.xs,
  },
  failedText: {
    fontSize: fontSize.xs,
    color: colors.red,
  },
});
