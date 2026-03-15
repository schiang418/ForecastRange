import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import { ForecastResult, CompareResult, CreditSpreadPricingResult } from '../types/forecast';

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
  creditSpreads: CreditSpreadPricingResult | null;
  creditSpreadsLoading: boolean;
  creditSpreadsError: string | null;
  narrativeLoading: boolean;
  loading: boolean;
  error: string | null;

  // Premium-aware analysis (single ticker)
  premiumAnalysis: string | null;
  premiumAnalysisLoading: boolean;
  premiumAnalysisError: string | null;

  // Premium-aware narrative (multi-ticker)
  premiumNarrative: string | null;
  premiumNarrativeLoading: boolean;
  premiumNarrativeError: string | null;
  premiumNarrativeProgress: string | null;
  spreadsByTicker: Record<string, CreditSpreadPricingResult> | null;

  fetchForecast: (ticker: string) => Promise<void>;
  fetchComparison: (tickers: string[]) => Promise<void>;
  fetchSpreadAnalysis: (forecast: ForecastResult) => Promise<void>;
  fetchCreditSpreads: (forecast: ForecastResult) => Promise<void>;
  fetchNarrative: (comparison: CompareResult) => Promise<void>;
  fetchPremiumAnalysis: (forecast: ForecastResult) => Promise<void>;
  fetchPremiumNarrative: (comparison: CompareResult) => Promise<void>;
  clearError: () => void;
}

export const useForecastStore = create<ForecastState>((set, get) => ({
  forecast: null,
  comparison: null,
  spreadAnalysis: null,
  creditSpreads: null,
  creditSpreadsLoading: false,
  creditSpreadsError: null,
  narrativeLoading: false,
  loading: false,
  error: null,

  // Premium-aware analysis (single ticker)
  premiumAnalysis: null,
  premiumAnalysisLoading: false,
  premiumAnalysisError: null,

  // Premium-aware narrative (multi-ticker)
  premiumNarrative: null,
  premiumNarrativeLoading: false,
  premiumNarrativeError: null,
  premiumNarrativeProgress: null,
  spreadsByTicker: null,

  fetchForecast: async (ticker: string) => {
    set({
      loading: true, error: null,
      spreadAnalysis: null, creditSpreads: null, creditSpreadsError: null,
      premiumAnalysis: null, premiumAnalysisError: null,
    });
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
    set({
      loading: true, error: null,
      premiumNarrative: null, premiumNarrativeError: null,
      premiumNarrativeProgress: null, spreadsByTicker: null,
    });
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

  fetchCreditSpreads: async (forecast: ForecastResult) => {
    set({ creditSpreadsLoading: true, creditSpreadsError: null });
    try {
      const data = await api.fetchCreditSpreads(forecast.ticker, forecast.horizons, forecast.spot);
      set({ creditSpreads: data, creditSpreadsLoading: false });
    } catch (error: any) {
      set({
        creditSpreadsLoading: false,
        creditSpreadsError: error.response?.data?.error || error.message,
      });
    }
  },

  fetchNarrative: async (comparison: CompareResult) => {
    set({ narrativeLoading: true });
    try {
      const narrative = await api.fetchNarrative(comparison.comparison);
      const current = get().comparison;
      if (current) {
        set({ comparison: { ...current, narrative }, narrativeLoading: false });
      } else {
        set({ narrativeLoading: false });
      }
    } catch (error: any) {
      set({ narrativeLoading: false, error: error.response?.data?.error || error.message });
    }
  },

  fetchPremiumAnalysis: async (forecast: ForecastResult) => {
    set({ premiumAnalysisLoading: true, premiumAnalysisError: null });
    try {
      // Fetch credit spreads first if not already loaded
      let spreads = get().creditSpreads;
      if (!spreads) {
        console.log(`[premiumAnalysis] Fetching credit spreads for ${forecast.ticker}, spot=${forecast.spot}, horizons=${forecast.horizons.length}`);
        spreads = await api.fetchCreditSpreads(forecast.ticker, forecast.horizons, forecast.spot);
        console.log(`[premiumAnalysis] Credit spreads received: ${spreads.putSpreads.length} put rows, ${spreads.callSpreads.length} call rows`);
        set({ creditSpreads: spreads });
      } else {
        console.log(`[premiumAnalysis] Using cached credit spreads`);
      }
      console.log(`[premiumAnalysis] Calling premium-aware analysis endpoint...`);
      const analysis = await api.fetchPremiumAwareSpreadAnalysis(forecast, spreads);
      console.log(`[premiumAnalysis] Analysis received, length=${analysis.length}`);
      set({ premiumAnalysis: analysis, premiumAnalysisLoading: false });
    } catch (error: any) {
      console.error(`[premiumAnalysis] Error:`, error.response?.status, error.response?.data?.error || error.message);
      set({
        premiumAnalysisLoading: false,
        premiumAnalysisError: error.response?.data?.error || error.message,
      });
    }
  },

  fetchPremiumNarrative: async (comparison: CompareResult) => {
    set({
      premiumNarrativeLoading: true,
      premiumNarrativeError: null,
      premiumNarrativeProgress: null,
    });
    try {
      // Step 1: Fetch credit spreads for all tickers
      let spreads = get().spreadsByTicker;
      if (!spreads) {
        const tickersWithHorizons = comparison.comparison.tickers.filter(
          (t) => t.horizons && t.horizons.length > 0
        );
        console.log(`[premiumNarrative] Tickers: ${comparison.comparison.tickers.length}, with horizons: ${tickersWithHorizons.length}`);
        comparison.comparison.tickers.forEach((t) => {
          console.log(`[premiumNarrative]   ${t.ticker}: horizons=${t.horizons?.length ?? 0}`);
        });

        if (tickersWithHorizons.length === 0) {
          throw new Error('No horizon data available. Please re-run the comparison.');
        }

        set({
          premiumNarrativeProgress: `Fetching credit spread pricing for ${tickersWithHorizons.length} tickers...`,
        });

        const batchInput = tickersWithHorizons.map((t) => ({
          ticker: t.ticker,
          spot: t.spot,
          horizons: t.horizons!,
        }));

        console.log(`[premiumNarrative] Calling batch credit spreads for: ${batchInput.map(t => t.ticker).join(', ')}`);
        const batchResult = await api.fetchBatchCreditSpreads(batchInput);
        spreads = batchResult.results;
        console.log(`[premiumNarrative] Batch results received for: ${Object.keys(spreads).join(', ')}`);
        set({ spreadsByTicker: spreads });
      } else {
        console.log(`[premiumNarrative] Using cached spreads for: ${Object.keys(spreads).join(', ')}`);
      }

      // Step 2: Send to AI
      set({ premiumNarrativeProgress: 'Generating premium-aware AI analysis...' });
      console.log(`[premiumNarrative] Calling premium narrative endpoint...`);
      const narrative = await api.fetchPremiumNarrative(comparison.comparison, spreads);
      console.log(`[premiumNarrative] Narrative received, length=${narrative.length}`);
      set({
        premiumNarrative: narrative,
        premiumNarrativeLoading: false,
        premiumNarrativeProgress: null,
      });
    } catch (error: any) {
      console.error(`[premiumNarrative] Error:`, error.response?.status, error.response?.data?.error || error.message);
      set({
        premiumNarrativeLoading: false,
        premiumNarrativeError: error.response?.data?.error || error.message,
        premiumNarrativeProgress: null,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
