// Shared types — mirrored from client/src/api.ts

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

export interface VolatilityMetrics {
  currentIV: number | null;
  currentIVPct: number | null;
  rv20Annualized: number;
  rv20AnnualizedPct: number;
  ivRvRatio: number | null;
  volPremium: number | null;
  ivPercentile: number | null;
  ivRank: number | null;
  ivPercentileSource: 'iv_history' | 'rv_approximation';
  ivHistoryDays: number;
  ivHistoryRange: { min: number; max: number; median: number } | null;
  rvPercentile: number | null;
  rvRank: number | null;
  regime: string;
  premiumScore: number | null;
  premiumLabel: string | null;
  rvHistoryDays: number;
  rvHistoryRange: { min: number; max: number; median: number } | null;
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
  volatilityMetrics: VolatilityMetrics;
  horizons: ForecastHorizon[];
  error?: string;
}

export interface CompareTickerResult {
  ticker: string;
  rank: number;
  spot: number;
  currentIV: number | null;
  rv20: number | null;
  ivRvRatio: number | null;
  volPremium: number | null;
  ivPercentile: number | null;
  ivRank: number | null;
  rvPercentile: number | null;
  regime: string;
  premiumScore: number | null;
  premiumLabel: string | null;
  trendScore: number | null;
  weekMove: number | null;
  weekConfidence: number | null;
  weekSkew: string | null;
  ivAvailable: boolean;
  straddleAvailable: boolean;
  compositeScore: number;
  compositeComponents: {
    premiumScore: number;
    ivRvScore: number;
    ivPctScore: number;
    regimeScore: number;
  };
  verdict: string;
  horizons?: ForecastHorizon[];
}

export interface CompareResult {
  comparison: {
    tickers: CompareTickerResult[];
    bestPick: string | null;
    generatedAt: string;
  };
  narrative: string | null;
  failed?: { ticker: string; error: string }[];
}

// ── Chart types ──

export type ChartPeriod = '3m' | '6m' | '1y' | '2y';

export interface ChartBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  rsi14: number | null;
}

export interface ChartMarker {
  date: string;
  type: 'watch' | 'confirmed';
  price: number;
}

export interface ChartResult {
  ticker: string;
  period: ChartPeriod;
  bars: ChartBar[];
  markers?: ChartMarker[];
}

// ── Event types ──

export interface UpcomingEvent {
  type: 'fomc' | 'dividend' | 'split' | 'earnings';
  date: string;
  label: string;
  description?: string;
}

export interface EventsResult {
  ticker: string;
  events: UpcomingEvent[];
  fromDate: string;
  toDate: string;
}

// ── Credit Spread Pricing types ──

export interface CreditSpreadCell {
  sellStrike: number;
  buyStrike: number;
  sellMid: number;
  buyMid: number;
  premium: number;
  premiumPerContract: number;
  maxLoss: number;
  sellIV: number | null;
  buyIV: number | null;
}

export interface CreditSpreadRow {
  horizon: string;
  horizonWeeks: number;
  horizonDays: number;
  targetDate: string | null;
  expectedMove: number;
  expectedMovePct: number;
  ranges: {
    range50?: CreditSpreadCell | null;
    range68?: CreditSpreadCell | null;
    range90?: CreditSpreadCell | null;
  };
}

export interface CreditSpreadPricingResult {
  putSpreads: CreditSpreadRow[];
  callSpreads: CreditSpreadRow[];
  spreadWidth: number;
}

export interface BatchCreditSpreadsResult {
  results: Record<string, CreditSpreadPricingResult>;
  failed?: { ticker: string; error: string }[];
}

// ── SMA Deviation types ──

export interface SmaDeviationExtension {
  zone: 'EXTREMELY_EXTENDED' | 'VERY_EXTENDED' | 'EXTENDED' | 'NORMAL' | 'COMPRESSED' | 'VERY_COMPRESSED' | 'EXTREMELY_COMPRESSED';
  direction: 'above' | 'below';
}

export interface SmaDeviationDistribution {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface SmaDeviationSingle {
  period: number;
  value: number;
  deviationDollars: number;
  deviationPct: number;
  percentileRank: number;
  directionalPercentile: number;
  frequencyLabel: string;
  extension: SmaDeviationExtension;
  distribution: SmaDeviationDistribution;
  tradingDaysAnalyzed: number;
  approxYears: number;
  histogram: { binStart: number; binEnd: number; count: number; pct: number }[];
}

export interface SmaDeviationResult {
  ticker: string;
  date: string;
  price: number;
  tradingDaysAnalyzed: number;
  sma20: SmaDeviationSingle | null;
  sma50: SmaDeviationSingle | null;
  interpretation: string;
}
