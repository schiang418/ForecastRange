import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, spacing, fontSize } from '../config/theme';
import { useForecastStore } from '../store/forecastStore';
import ConeChart from '../components/ConeChart';
import HorizonCard from '../components/HorizonCard';
import VolatilityCard from '../components/VolatilityCard';
import PriceHistoryChart from '../components/PriceHistoryChart';
import UpcomingEvents from '../components/UpcomingEvents';
import PremiumChecklist from '../components/PremiumChecklist';
import CreditSpreadTable from '../components/CreditSpreadTable';

export default function ForecastScreen() {
  const [ticker, setTicker] = useState('');
  const {
    forecast, loading, error,
    fetchForecast, fetchSpreadAnalysis, spreadAnalysis,
    fetchCreditSpreads, creditSpreads, creditSpreadsLoading, creditSpreadsError,
  } = useForecastStore();

  const handleSubmit = () => {
    const t = ticker.trim().toUpperCase();
    if (t) fetchForecast(t);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Ticker Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Enter ticker (e.g. AAPL)"
            placeholderTextColor={colors.textMuted}
            value={ticker}
            onChangeText={setTicker}
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
              <Text style={styles.buttonText}>Forecast</Text>
            )}
          </Pressable>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Results */}
        {forecast && (
          <>
            {/* Header */}
            <View style={styles.resultHeader}>
              <Text style={styles.tickerTitle}>{forecast.ticker}</Text>
              <Text style={styles.spotPrice}>${forecast.spot.toFixed(2)}</Text>
              <Text style={styles.trendScore}>
                Trend: {forecast.trendScore > 0 ? '+' : ''}{forecast.trendScore.toFixed(2)}
                {' '}({forecast.trendScore > 0.2 ? 'Bullish' : forecast.trendScore < -0.2 ? 'Bearish' : 'Neutral'})
              </Text>
            </View>

            {/* Volatility */}
            <VolatilityCard metrics={forecast.volatilityMetrics} />

            {/* Price History Chart */}
            <PriceHistoryChart ticker={forecast.ticker} />

            {/* Upcoming Events */}
            <UpcomingEvents ticker={forecast.ticker} />

            {/* Cone Chart */}
            <ConeChart horizons={forecast.horizons} spot={forecast.spot} />

            {/* Premium Sell / Avoid Checklist */}
            <PremiumChecklist volatilityMetrics={forecast.volatilityMetrics} ticker={forecast.ticker} />

            {/* Horizons */}
            {forecast.horizons.map((h, i) => (
              <HorizonCard key={i} horizon={h} />
            ))}

            {/* Credit Spread Pricing - On Demand */}
            {!creditSpreads && !creditSpreadsLoading && (
              <Pressable
                style={styles.creditSpreadButton}
                onPress={() => fetchCreditSpreads(forecast)}
              >
                <Text style={styles.creditSpreadButtonText}>Load Credit Spread Pricing</Text>
              </Pressable>
            )}

            {creditSpreadsError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{creditSpreadsError}</Text>
              </View>
            )}

            {creditSpreadsLoading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.loadingText}>Fetching credit spread pricing...</Text>
              </View>
            )}

            {creditSpreads && (
              <>
                <CreditSpreadTable
                  rows={creditSpreads.putSpreads}
                  type="put"
                  spreadWidth={creditSpreads.spreadWidth}
                />
                <CreditSpreadTable
                  rows={creditSpreads.callSpreads}
                  type="call"
                  spreadWidth={creditSpreads.spreadWidth}
                />
              </>
            )}

            {/* AI Spread Analysis Button */}
            <Pressable
              style={styles.spreadButton}
              onPress={() => fetchSpreadAnalysis(forecast)}
              disabled={loading}
            >
              <Text style={styles.spreadButtonText}>
                {spreadAnalysis ? 'Refresh AI Spread Analysis' : 'Get AI Credit Spread Analysis'}
              </Text>
            </Pressable>

            {/* Spread Analysis Result */}
            {spreadAnalysis && (
              <View style={styles.spreadBox}>
                <Text style={styles.spreadTitle}>AI Credit Spread Analysis</Text>
                <Text style={styles.spreadText}>{spreadAnalysis}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
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
  resultHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  tickerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  spotPrice: {
    fontSize: fontSize.xl,
    color: colors.accent,
    fontWeight: '600',
  },
  trendScore: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  creditSpreadButton: {
    height: 44,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  creditSpreadButtonText: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  loadingBox: {
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
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  spreadButton: {
    height: 48,
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    marginTop: spacing.md,
  },
  spreadButtonText: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  spreadBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spreadTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  spreadText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
