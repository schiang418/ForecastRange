import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { colors, spacing, fontSize } from '../config/theme';
import { api } from '../services/api';
import { useForecastStore } from '../store/forecastStore';

interface WatchlistItem {
  ticker: string;
  added_at: string;
}

export default function WatchlistScreen() {
  const [tickers, setTickers] = useState<WatchlistItem[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [loading, setLoading] = useState(true);
  const { fetchForecast } = useForecastStore();

  const loadWatchlist = useCallback(async () => {
    try {
      setLoading(true);
      const list = await api.getWatchlist();
      setTickers(list);
    } catch (error: any) {
      console.error('Failed to load watchlist:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const handleAdd = async () => {
    const t = newTicker.trim().toUpperCase();
    if (!t) return;
    try {
      await api.addToWatchlist(t);
      setNewTicker('');
      loadWatchlist();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to add ticker');
    }
  };

  const handleRemove = (ticker: string) => {
    Alert.alert('Remove', `Remove ${ticker} from watchlist?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.removeFromWatchlist(ticker);
            loadWatchlist();
          } catch {
            Alert.alert('Error', 'Failed to remove ticker');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: WatchlistItem }) => (
    <View style={styles.tickerRow}>
      <Pressable
        style={styles.tickerInfo}
        onPress={() => fetchForecast(item.ticker)}
      >
        <Text style={styles.tickerName}>{item.ticker}</Text>
        <Text style={styles.tickerDate}>
          Added {new Date(item.added_at).toLocaleDateString()}
        </Text>
      </Pressable>
      <Pressable
        style={styles.removeButton}
        onPress={() => handleRemove(item.ticker)}
      >
        <Text style={styles.removeText}>Remove</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Watchlist</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add ticker..."
          placeholderTextColor={colors.textMuted}
          value={newTicker}
          onChangeText={setNewTicker}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
      ) : tickers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No tickers yet</Text>
          <Text style={styles.emptySubtitle}>Add tickers to your watchlist to quickly access forecasts</Text>
        </View>
      ) : (
        <FlatList
          data={tickers}
          keyExtractor={(item) => item.ticker}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButton: {
    height: 44,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: 10,
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  list: {
    paddingBottom: 100,
  },
  tickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tickerInfo: {
    flex: 1,
  },
  tickerName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  tickerDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  removeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  removeText: {
    fontSize: fontSize.sm,
    color: colors.red,
    fontWeight: '600',
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
