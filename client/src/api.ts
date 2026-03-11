export interface ForecastHorizon {
  horizon: string;
  horizonWeeks: number;
  horizonDays: number;
  center: number;
  expectedMove: number;
  expectedMovePct: number;
  range50: { low: number; high: number };
  range68: { low: number; high: number };
  range90: { low: number; high: number };
  skew: string;
  trendDrift: number;
  confidence: number;
  confidenceLabel: string;
  ivAvailable: boolean;
  ivUsed: number | null;
  components: {
    atrMove: number;
    rvMove: number;
    ivMove: number | null;
  };
}

export interface ForecastResult {
  ticker: string;
  spot: number;
  generatedAt: string;
  dataPoints: number;
  ivAvailable: boolean;
  ivExpirations: number;
  trendScore: number;
  indicators: {
    ema20: number;
    sma50: number;
    rsi14: number;
    atr14: number;
    rv20Daily: number;
    ema20Slope: number | null;
    ema50Slope: number | null;
    macdHistogram: number | null;
    bollingerBandwidth: number | null;
  };
  horizons: ForecastHorizon[];
  error?: string;
}

export async function fetchForecast(ticker: string, horizons?: number[]): Promise<ForecastResult> {
  const res = await fetch('/api/forecast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker, horizons }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(data.error || `Failed to fetch forecast (${res.status})`);
  }

  return res.json();
}
