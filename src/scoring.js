/**
 * Scoring utility — ported from SwingTrade.
 * Used for normalizing indicator values to [-1, +1] or [0, 1] ranges.
 */

/**
 * Linear interpolation between breakpoints.
 * breakpoints: array of [value, score] pairs, sorted by value ascending.
 * Values below the first breakpoint clamp to its score; above the last clamp to its score.
 */
function gradientScore(value, breakpoints) {
  if (breakpoints.length === 0) return 0;
  if (value <= breakpoints[0][0]) return breakpoints[0][1];
  if (value >= breakpoints[breakpoints.length - 1][0]) return breakpoints[breakpoints.length - 1][1];

  for (let i = 1; i < breakpoints.length; i++) {
    if (value <= breakpoints[i][0]) {
      const [x0, y0] = breakpoints[i - 1];
      const [x1, y1] = breakpoints[i];
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return breakpoints[breakpoints.length - 1][1];
}

module.exports = { gradientScore };
