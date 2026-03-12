export interface WeightedComponent {
  value: number;
  weight: number;
}

export interface TrendComponent {
  raw: number | null;
  normalized: number;
  weight: number;
}

export interface SRLevel {
  price: number;
  type: string;
  date: string | null;
  side?: string;
}

export interface StraddleInfo {
  source: string;
  expiration: string;
  move: number;
  callMid: number | null;
  putMid: number | null;
  straddle: number | null;
  strike: number | null;
  scaleFactor: number | null;
  t: number | null;
}

export interface IVTermStructureEntry {
  expirationDate: string;
  iv: number;
  contractsUsed: number;
}

export interface StraddleTermStructureEntry {
  expirationDate: string;
  strike: number;
  callMid: number;
  putMid: number;
  straddle: number;
  expectedMove: number;
}

export interface StructureData {
  support: SRLevel | null;
  resistance: SRLevel | null;
  distToSupport: number | null;
  distToResistance: number | null;
  structureMove: number;
  lookbackDays: number;
  levels: SRLevel[];
}

export interface IVTermStructureInfo {
  interpolated: boolean;
  beforeExp: string | null;
  afterExp: string | null;
  beforeIV: number | null;
  afterIV: number | null;
  t: number;
}

export interface ForecastHorizon {
  horizon: string;
  horizonWeeks: number;
  horizonDays: number;
  targetDate: string | null;
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
  optionsSource: string | null;
  components: {
    atrMove: number;
    rvMove: number;
    ivMove: number | null;
    straddleMove: number | null;
    structureMove: number;
  };
  blending: {
    weights: Record<string, number>;
    contributions: Record<string, number>;
    formula: string;
  };
  confidenceBreakdown: Record<string, WeightedComponent>;
  trendDriftCalc: {
    formula: string;
    values: { spot: number; k: number; trendScore: number; sqrtFactor: number };
    result: number;
  };
  bandCalc: {
    sigmaMultipliers: { band50: number; band68: number; band90: number };
    moveUsed: number;
    centerUsed: number;
  };
  straddleInfo: StraddleInfo | null;
  ivTermStructure: IVTermStructureInfo | null;
  structureData: StructureData;
}

export interface TrendBreakdown {
  ema20Slope: TrendComponent;
  ema50Slope: TrendComponent;
  macdHistogram: TrendComponent;
  rsiRegime: TrendComponent;
}

export interface ForecastResult {
  ticker: string;
  spot: number;
  generatedAt: string;
  dataPoints: number;
  ivAvailable: boolean;
  ivExpirations: number;
  straddleAvailable: boolean;
  straddleExpirations: number;
  trendScore: number;
  trendBreakdown: TrendBreakdown;
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
  ivTermStructure: IVTermStructureEntry[] | null;
  straddleTermStructure: StraddleTermStructureEntry[] | null;
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
