import axios, { AxiosInstance } from 'axios';
import * as storage from './storage';
import { API_BASE_URL } from '../config';
import {
  ForecastResult, CompareResult, ChartResult, ChartPeriod,
  EventsResult, CreditSpreadPricingResult, ForecastHorizon,
  BatchCreditSpreadsResult, SmaDeviationResult,
} from '../types/forecast';

const TOKEN_KEY = 'auth_token';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    // Attach auth token to every request
    this.client.interceptors.request.use(async (config) => {
      const token = await storage.getItem(TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  // ── Auth ──────────────────────────────────────────────────

  async loginWithApple(identityToken: string, fullName?: { givenName?: string; familyName?: string }) {
    const { data } = await this.client.post('/api/auth/apple', { identityToken, fullName });
    await storage.setItem(TOKEN_KEY, data.token);
    return data.user;
  }

  async loginWithGoogle(idToken: string) {
    const { data } = await this.client.post('/api/auth/google', { idToken });
    await storage.setItem(TOKEN_KEY, data.token);
    return data.user;
  }

  async getMe() {
    const { data } = await this.client.get('/api/auth/me');
    return data.user;
  }

  async refreshToken() {
    const { data } = await this.client.post('/api/auth/refresh');
    await storage.setItem(TOKEN_KEY, data.token);
  }

  async logout() {
    await storage.deleteItem(TOKEN_KEY);
  }

  async hasToken(): Promise<boolean> {
    const token = await storage.getItem(TOKEN_KEY);
    return !!token;
  }

  // ── Forecast ──────────────────────────────────────────────

  async fetchForecast(ticker: string): Promise<ForecastResult> {
    const { data } = await this.client.post('/api/forecast', { ticker });
    return data;
  }

  async fetchSpreadAnalysis(forecast: ForecastResult): Promise<string> {
    const { data } = await this.client.post('/api/forecast/spreads', { forecast });
    return data.analysis;
  }

  // ── Chart ────────────────────────────────────────────────

  async fetchChart(ticker: string, period: ChartPeriod = '6m'): Promise<ChartResult> {
    const { data } = await this.client.post('/api/chart', { ticker, period });
    return data;
  }

  // ── Events ──────────────────────────────────────────────

  async fetchEvents(ticker: string): Promise<EventsResult> {
    const { data } = await this.client.post('/api/events', { ticker });
    return data;
  }

  // ── Credit Spread Pricing ───────────────────────────────

  async fetchCreditSpreads(ticker: string, horizons: ForecastHorizon[], spot: number): Promise<CreditSpreadPricingResult> {
    const { data } = await this.client.post('/api/forecast/credit-spreads', { ticker, horizons, spot }, {
      timeout: 120000, // 2 minutes — credit spread pricing fetches many individual contracts
    });
    return data;
  }

  // ── Premium-Aware Analysis ─────────────────────────────────

  async fetchPremiumAwareSpreadAnalysis(
    forecast: ForecastResult,
    creditSpreads: CreditSpreadPricingResult
  ): Promise<string> {
    const { data } = await this.client.post('/api/forecast/spreads/premium-aware', {
      forecast,
      creditSpreads,
    }, { timeout: 120000 });
    return data.analysis;
  }

  async fetchBatchCreditSpreads(
    tickers: { ticker: string; spot: number; horizons: ForecastHorizon[] }[]
  ): Promise<BatchCreditSpreadsResult> {
    const { data } = await this.client.post('/api/forecast/credit-spreads/batch', {
      tickers,
    }, { timeout: 300000 }); // 5 minutes — sequential fetching for many tickers
    return data;
  }

  async fetchPremiumNarrative(
    comparison: CompareResult['comparison'],
    spreadsByTicker: Record<string, CreditSpreadPricingResult>
  ): Promise<string> {
    const { data } = await this.client.post('/api/compare/premium-narrative', {
      comparison,
      spreadsByTicker,
    }, { timeout: 120000 });
    return data.narrative;
  }

  // ── Compare ───────────────────────────────────────────────

  async fetchComparison(tickers: string[]): Promise<CompareResult> {
    const { data } = await this.client.post('/api/compare', { tickers });
    return data;
  }

  async fetchNarrative(comparison: CompareResult['comparison']): Promise<string> {
    const { data } = await this.client.post('/api/compare/narrative', { comparison });
    return data.narrative;
  }

  // ── Watchlist ─────────────────────────────────────────────

  async getWatchlist(): Promise<{ ticker: string; added_at: string }[]> {
    const { data } = await this.client.get('/api/watchlist');
    return data.tickers;
  }

  async addToWatchlist(ticker: string): Promise<void> {
    await this.client.post('/api/watchlist', { ticker });
  }

  async removeFromWatchlist(ticker: string): Promise<void> {
    await this.client.delete(`/api/watchlist/${ticker}`);
  }

  // ── SMA Deviation ────────────────────────────────────────

  async fetchSmaDeviation(ticker: string): Promise<SmaDeviationResult> {
    const { data } = await this.client.post('/api/deviation', { ticker });
    return data;
  }

  // ── Health ────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/api/health');
      return true;
    } catch {
      return false;
    }
  }
}

export const api = new ApiClient();
