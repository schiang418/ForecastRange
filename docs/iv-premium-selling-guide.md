# Implied Volatility Guide for Premium Sellers

A practical reference for understanding and using the volatility metrics in ForecastRange, written for traders who sell options to collect premium.

---

## Core Concepts

### Implied Volatility (IV)

IV is the market's forecast of how much a stock will move over the life of an option. It is extracted from option prices — higher option prices mean higher IV.

- Expressed as an annualized percentage (e.g., 56% means the market expects ~56% movement over one year)
- IV is forward-looking — it reflects what traders *expect*, not what has happened
- IV tends to overstate actual movement (this is why selling premium works over time)

**How to read it:** A stock with 80% IV is expected to move roughly ±80% over the next year, or about ±5% per day (80% ÷ √252 ≈ 5%).

### Realized Volatility (RV)

RV measures how much a stock *actually* moved over a past window (we use 20 trading days ≈ 1 month).

- Computed from daily closing prices using log returns
- Also annualized for comparison with IV
- Purely backward-looking

**How to read it:** If RV₂₀ is 45%, the stock has been moving at a 45% annualized pace over the last month.

### IV/RV Ratio

The ratio of implied volatility to realized volatility. This is the single most important metric for premium sellers.

```
IV/RV Ratio = Current IV ÷ Current RV₂₀
```

| IV/RV Ratio | Interpretation | Premium Selling Signal |
|-------------|---------------|----------------------|
| > 1.5x | IV far exceeds actual movement | Strong — options are expensive relative to actual risk |
| 1.2x – 1.5x | Healthy premium over realized | Favorable — normal edge for sellers |
| 1.0x – 1.2x | IV roughly matches realized | Neutral — limited edge |
| < 1.0x | IV *understates* actual movement | Avoid — options are cheap, you're underpaid for the risk |

**Why it matters:** When you sell an option, you're selling IV. Your P&L depends on whether IV overestimated the actual move (RV). An IV/RV ratio above 1.0 means options are priced above recent actual movement — this is your edge.

**Caveat:** A high IV/RV ratio after a quiet period can be a warning that the market expects a volatility *increase* (earnings, Fed, etc.). Always check the calendar.

---

## Percentile & Rank Metrics

### IV Percentile

What percentage of historical IV readings fall *below* the current IV.

```
IV Percentile = (# of past IVs below current IV) ÷ (total historical IVs) × 100
```

- Uses up to 252 days (1 year) of IV history
- When true IV history isn't available, falls back to comparing IV against historical RV (less accurate, tends to read high)

| IV Percentile | Meaning | For Premium Sellers |
|--------------|---------|-------------------|
| 80–100% | IV is near its highs — options are expensive | Best environment to sell premium |
| 50–80% | IV is above average | Good — above-average premiums |
| 20–50% | IV is below average | Cautious — premiums are thin |
| 0–20% | IV is near its lows — options are cheap | Worst time to sell — low premiums, high risk of IV expansion |

### IV Rank

Where current IV sits between its 1-year high and low, using min-max scaling.

```
IV Rank = (Current IV − 1yr Min IV) ÷ (1yr Max IV − 1yr Min IV) × 100
```

| IV Rank | Meaning |
|---------|---------|
| 80–100% | IV near its yearly high |
| 40–60% | IV in the middle of its range |
| 0–20% | IV near its yearly low |

### Percentile vs. Rank — Which to Use?

**IV Percentile** is generally more reliable because it accounts for the full distribution. IV Rank can be skewed by a single extreme reading.

Example: If IV spent 350 days at 30%, spiked to 100% for one day, then settled at 35%:
- IV Rank = (35−30)/(100−30) = 7% — misleadingly low
- IV Percentile = ~50% — more accurate, half the readings are below 35%

**Rule of thumb:** Use percentile as your primary gauge, rank as a secondary check.

### RV Percentile & RV Rank

Same calculations but applied to realized volatility history. These tell you whether the *stock itself* is moving more or less than usual, independent of option pricing.

- High RV percentile + High IV percentile = genuinely volatile stock with expensive options
- Low RV percentile + High IV percentile = calm stock with expensive options (good for selling)
- High RV percentile + Low IV percentile = dangerous — options are cheap but the stock is moving

---

## Volatility Regime

A summary label based on how current RV compares to its historical median, adjusted by IV context.

| Regime | Condition | What It Means |
|--------|-----------|--------------|
| Compressed | RV < 80% of median | Stock is unusually quiet |
| Normal | RV is 80–150% of median | Typical movement |
| Elevated | RV is 150–200% of median | Above-average movement |
| Extreme | RV > 200% of median | Crisis-level movement |

**Important nuance:** The regime blends RV with IV when available:
- If RV says "compressed" but IV percentile is ≥70%, the regime upgrades to "normal" — the market expects volatility to expand even though the stock is currently quiet
- If RV says "extreme" but IV percentile is ≤30%, the regime downgrades to "elevated" — the spike may not persist

**For premium sellers:** "Compressed" with high IV is actually a sweet spot — you collect rich premiums while the stock sits still. "Extreme" regimes are dangerous; even high premiums may not compensate for the risk.

---

## Premium Quality Score

A composite score (0–100) that combines multiple signals into a single premium-selling attractiveness rating.

### Formula

```
Score = 0.45 × IV Percentile + 0.35 × IV/RV Normalized + 0.20 × IV Trend
```

Where:
- **IV Percentile** (45% weight): Are options expensive vs. history?
- **IV/RV Normalized** (35% weight): Are options expensive vs. current actual movement?
- **IV Trend** (20% weight): Is the premium likely to persist?

### Labels

| Label | Conditions | Action |
|-------|-----------|--------|
| Rich | IV Pctl ≥ 75% AND IV/RV ≥ 1.3x | Aggressively sell premium |
| Moderately Attractive | IV Pctl ≥ 50% AND IV/RV ≥ 1.1x | Sell premium with normal sizing |
| Neutral | IV Pctl ≥ 25% | Selective — only with a directional view |
| Cheap | IV Pctl < 25% | Avoid selling; consider buying premium |

---

## Practical Playbook

### When to Sell Premium

The ideal setup combines multiple confirming signals:

1. **IV Percentile ≥ 60%** — options are historically expensive
2. **IV/RV Ratio ≥ 1.3x** — options overstate current movement
3. **Vol Regime is Normal or Compressed** — no crisis underway
4. **Premium Score ≥ 50** — composite confirms

### When to Avoid Selling

Red flags that suggest staying on the sidelines:

1. **IV Percentile < 25%** — premiums are historically thin
2. **IV/RV Ratio < 1.0x** — the stock is moving *more* than options imply
3. **Vol Regime is Extreme** — tail risk is real
4. **Upcoming catalyst** — earnings, FDA, FOMC within your option's expiration

### Position Sizing by Premium Score

| Premium Score | Suggested Position Size |
|--------------|----------------------|
| 80–100 | Full size — conditions are ideal |
| 60–79 | 75% of full size |
| 40–59 | 50% of full size |
| 20–39 | 25% of full size or skip |
| 0–19 | Do not sell premium |

### Reading the Signals Together

**Scenario 1: TSLA — IV Pctl 42%, IV/RV 1.47x, Regime Compressed**
- IV is average historically, but options significantly overstate current movement
- The stock is quiet right now (compressed), so premiums should decay favorably
- Moderate sell signal — the IV/RV ratio is your edge, not the percentile

**Scenario 2: MSTR — IV Pctl 48%, IV/RV 1.24x, Regime Normal**
- Everything is middling — no strong signal either way
- Premium quality is neutral; only sell with a directional thesis

**Scenario 3: Hypothetical — IV Pctl 90%, IV/RV 2.0x, Regime Normal**
- Options are expensive by every measure while the stock moves normally
- Textbook premium selling opportunity — rich premiums with normal underlying risk

**Scenario 4: Hypothetical — IV Pctl 15%, IV/RV 0.85x, Regime Elevated**
- Options are cheap, the stock is moving more than implied, and volatility is rising
- Worst possible time to sell — consider buying options or staying flat

---

## Data Sources and Methodology

### IV Source
Current IV is interpolated from the at-the-money options chain (nearest expiration, call/put average). This represents the market's short-term volatility expectation.

### IV History
- **Live data**: Each forecast stores the current day's IV in the database
- **Synthetic backfill**: For new tickers with fewer than 30 days of history, synthetic IV is generated from realized volatility using an AR(1) model calibrated to the current IV/RV ratio. This bootstraps percentile calculations until enough live data accumulates.
- The source of percentile data (live history vs. RV approximation) is displayed in the debug panel

### RV Calculation
20-day rolling window of log returns, annualized by √252. Uses daily closing prices from the OHLCV bar history (~200 days).

---

## Glossary

| Term | Definition |
|------|-----------|
| **ATM** | At-the-money — options with strike price near the current stock price |
| **IV** | Implied volatility — the market's expected future volatility, derived from option prices |
| **RV** | Realized volatility — actual historical volatility measured from price changes |
| **IV/RV Ratio** | How much IV exceeds RV; your theoretical edge as a premium seller |
| **IV Percentile** | % of historical IV readings below current IV (higher = more expensive options) |
| **IV Rank** | Current IV's position between its 1-year min and max (0–100%) |
| **Vol Premium** | The difference IV − RV in percentage points; positive means options overestimate risk |
| **Vol Regime** | Categorical label for current volatility environment (compressed/normal/elevated/extreme) |
| **Premium Score** | Composite 0–100 score rating how attractive current premiums are for selling |
| **Theta Decay** | The daily erosion of an option's time value — what premium sellers profit from |
| **Vega Risk** | Exposure to IV changes — if IV rises after you sell, your position loses value |
