import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { ForecastResult, CompareResult } from '../types/forecast';

const CACHE_KEY = 'forecast_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedForecast {
  result: ForecastResult;
  timestamp: number;
}

interface ForecastState {
  forecast: ForecastResult | null;
  comparison: CompareResult | null;
  spreadAnalysis: string | null;
  loading: boolean;
  error: string | null;

  fetchForecast: (ticker: string) => Promise<void>;
  fetchComparison: (tickers: string[]) => Promise<void>;
  fetchSpreadAnalysis: (forecast: ForecastResult) => Promise<void>;
  clearError: () => void;
}

export const useForecastStore = create<ForecastState>((set) => ({
  forecast: null,
  comparison: null,
  spreadAnalysis: null,
  loading: false,
  error: null,

  fetchForecast: async (ticker: string) => {
    set({ loading: true, error: null, spreadAnalysis: null });
    try {
      // Check cache
      const cacheRaw = await AsyncStorage.getItem(`${CACHE_KEY}_${ticker}`);
      if (cacheRaw) {
        const cached: CachedForecast = JSON.parse(cacheRaw);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          set({ forecast: cached.result, loading: false });
          return;
        }
      }

      const result = await api.fetchForecast(ticker);
      set({ forecast: result, loading: false });

      // Cache result
      await AsyncStorage.setItem(
        `${CACHE_KEY}_${ticker}`,
        JSON.stringify({ result, timestamp: Date.now() })
      );
    } catch (error: any) {
      set({ loading: false, error: error.response?.data?.error || error.message });
    }
  },

  fetchComparison: async (tickers: string[]) => {
    set({ loading: true, error: null });
    try {
      const result = await api.fetchComparison(tickers);
      set({ comparison: result, loading: false });
    } catch (error: any) {
      set({ loading: false, error: error.response?.data?.error || error.message });
    }
  },

  fetchSpreadAnalysis: async (forecast: ForecastResult) => {
    set({ loading: true, error: null });
    try {
      const analysis = await api.fetchSpreadAnalysis(forecast);
      set({ spreadAnalysis: analysis, loading: false });
    } catch (error: any) {
      set({ loading: false, error: error.response?.data?.error || error.message });
    }
  },

  clearError: () => set({ error: null }),
}));
