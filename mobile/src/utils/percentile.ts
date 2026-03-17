/**
 * Standard normal CDF using Abramowitz & Stegun approximation (formula 7.1.26).
 * Accurate to ~1.5e-7.
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

export interface TargetPercentileResult {
  sigma: number;
  /** Two-sided percentile (0-100): probability price stays within this distance of center */
  percentile: number;
  /** Whether the target is above or below the forecast center */
  side: 'above' | 'below' | 'at_center';
  /** Probability of price reaching or exceeding the target on the given side (0-100) */
  probBeyond: number;
}

/**
 * Given a target price, compute what percentile band it falls at.
 */
export function computeTargetPercentile(
  targetPrice: number,
  center: number,
  expectedMove: number,
): TargetPercentileResult {
  if (expectedMove === 0) {
    return { sigma: Infinity, percentile: 100, side: 'at_center', probBeyond: 0 };
  }

  const diff = targetPrice - center;
  const sigma = Math.abs(diff) / expectedMove;

  // Two-sided percentile: P(-sigma < Z < sigma) = 2 * Phi(sigma) - 1
  const percentile = (2 * normalCDF(sigma) - 1) * 100;

  const side: TargetPercentileResult['side'] =
    diff > 0.001 ? 'above' : diff < -0.001 ? 'below' : 'at_center';

  // Probability of price being beyond the target on that side: one-tail
  const probBeyond = (1 - normalCDF(sigma)) * 100;

  return { sigma, percentile, side, probBeyond };
}
