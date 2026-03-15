# Premium-Aware Analysis Feature

## Overview: AI Analysis with Live Option Pricing

**Date:** 2026-03-15
**Branch:** `claude/merge-ekmd7-branch-EcIs3`
**Status:** Implemented

---

## Summary

Added three missing server endpoints and supporting changes to enable "Analyze with Pricing" functionality on the mobile app. This feature combines the existing forecast/compare data with **real-time credit spread pricing** from Polygon.io, then sends both to Claude for premium-aware AI analysis with actual dollar amounts.

### Two Variants

| Feature | Screen | What it does |
|---|---|---|
| **Single-Ticker Premium Analysis** | Forecast | Fetches credit spreads for one ticker, then sends forecast + pricing to Claude for analysis with real premiums |
| **Multi-Ticker Premium Narrative** | Compare | Batch-fetches credit spreads for all compared tickers, then generates a comparative AI narrative with actual pricing |

---

## Problem

The mobile app had UI buttons ("Analyze with Pricing") that called three API endpoints that didn't exist on the server:

| Endpoint Called | Status | Error |
|---|---|---|
| `POST /api/forecast/spreads/premium-aware` | Missing | 404 |
| `POST /api/forecast/credit-spreads/batch` | Missing | 404 |
| `POST /api/compare/premium-narrative` | Missing | 404 |

Additionally, the compare endpoint didn't include `horizons` data per ticker, causing:
> "No horizon data available. Please re-run the comparison."

The web app worked because it only uses the basic (non-premium) endpoints:
- `POST /api/forecast/spreads` (AI analysis without pricing)
- `POST /api/compare/narrative` (AI narrative without pricing)
- `POST /api/forecast/credit-spreads` (pricing only, no AI)

---

## Architecture

### Data Flow: Single-Ticker Premium Analysis

```
User taps "Analyze with Pricing" on Forecast screen
  │
  ├─ Step 1: Fetch credit spreads (if not cached)
  │   Mobile: api.fetchCreditSpreads(ticker, horizons, spot)
  │   Server: POST /api/forecast/credit-spreads  (already existed)
  │   Returns: { putSpreads[], callSpreads[], spreadWidth }
  │
  └─ Step 2: Send forecast + pricing to AI
      Mobile: api.fetchPremiumAwareSpreadAnalysis(forecast, creditSpreads)
      Server: POST /api/forecast/spreads/premium-aware  (NEW)
      Returns: { analysis: string }
```

### Data Flow: Multi-Ticker Premium Narrative

```
User taps "Analyze with Pricing" on Compare screen
  │
  ├─ Step 1: Extract horizons from comparison result
  │   (horizons are now included in /api/compare response)
  │
  ├─ Step 2: Batch-fetch credit spreads for all tickers
  │   Mobile: api.fetchBatchCreditSpreads([{ ticker, spot, horizons }])
  │   Server: POST /api/forecast/credit-spreads/batch  (NEW)
  │   Returns: { results: { [ticker]: CreditSpreadPricingResult } }
  │
  └─ Step 3: Send comparison + all pricing to AI
      Mobile: api.fetchPremiumNarrative(comparison, spreadsByTicker)
      Server: POST /api/compare/premium-narrative  (NEW)
      Returns: { narrative: string }
```

### Endpoint Relationship Diagram

```
Existing Endpoints (web + mobile):
  POST /api/forecast              → ForecastResult (with horizons)
  POST /api/forecast/spreads      → AI analysis (forecast only, no pricing)
  POST /api/forecast/credit-spreads → Credit spread pricing (no AI)
  POST /api/compare               → CompareResult (now includes horizons)
  POST /api/compare/narrative     → AI narrative (no pricing)

New Endpoints (mobile premium features):
  POST /api/forecast/spreads/premium-aware    → AI analysis WITH pricing
  POST /api/forecast/credit-spreads/batch     → Batch credit spread pricing
  POST /api/compare/premium-narrative         → AI narrative WITH pricing
```

---

## New Server Endpoints

### 1. `POST /api/forecast/spreads/premium-aware`

**File:** `server/routes/spreads.js`
**Purpose:** AI spread analysis enriched with real credit spread pricing data.

**Request Body:**
```json
{
  "forecast": { "ticker": "TSLA", "spot": 390, "horizons": [...], ... },
  "creditSpreads": { "putSpreads": [...], "callSpreads": [...], "spreadWidth": 50 }
}
```

**Response:**
```json
{
  "analysis": "**PUT CREDIT SPREAD EVALUATION:**\n- Sell PUT at $370 / Buy PUT at $320 — Premium: $555/contract\n..."
}
```

**How it differs from `/api/forecast/spreads`:**
- Receives `creditSpreads` in addition to `forecast`
- Builds a `pricingBlock` with real premiums, max loss, and per-contract amounts
- Claude prompt instructs AI to use actual dollar amounts from live pricing
- Results include concrete risk/reward ratios based on market prices

**Timeout:** 120 seconds (AI generation + large prompt)

---

### 2. `POST /api/forecast/credit-spreads/batch`

**File:** `server/routes/forecast.js`
**Purpose:** Fetch credit spread pricing for multiple tickers sequentially.

**Request Body:**
```json
{
  "tickers": [
    { "ticker": "AAPL", "spot": 195, "horizons": [...] },
    { "ticker": "TSLA", "spot": 390, "horizons": [...] }
  ]
}
```

**Response:**
```json
{
  "results": {
    "AAPL": { "putSpreads": [...], "callSpreads": [...], "spreadWidth": 50 },
    "TSLA": { "putSpreads": [...], "callSpreads": [...], "spreadWidth": 50 }
  },
  "failed": [{ "ticker": "XYZ", "error": "No options data" }]
}
```

**Implementation notes:**
- Processes tickers sequentially (not parallel) to avoid Polygon rate limits
- Reuses the same `computeCreditSpreadPricing` logic as the single-ticker endpoint
- Individual ticker failures don't block other tickers
- Timeout: 300 seconds (5 minutes) on mobile side due to sequential processing

---

### 3. `POST /api/compare/premium-narrative`

**File:** `server/routes/compare.js`
**Purpose:** AI comparative narrative enriched with real credit spread pricing.

**Request Body:**
```json
{
  "comparison": { "tickers": [...], "bestPick": "AAPL", ... },
  "spreadsByTicker": {
    "AAPL": { "putSpreads": [...], "callSpreads": [...], "spreadWidth": 50 },
    "TSLA": { "putSpreads": [...], "callSpreads": [...], "spreadWidth": 50 }
  }
}
```

**Response:**
```json
{
  "narrative": "Among these tickers, AAPL offers the strongest premium selling setup with..."
}
```

**How it differs from `/api/compare/narrative`:**
- Includes 1W 68% range put/call spread premiums per ticker in the prompt
- Claude is instructed to reference actual premium amounts in its analysis
- More actionable output with real dollar comparisons

---

## Other Changes

### Compare Response Now Includes Horizons

**File:** `server/compare.js` — `buildComparison()`

Previously, `buildComparison()` only extracted summary fields (spot, IV, regime, etc.) from each ticker's forecast. The full `horizons` array was dropped, which meant the mobile app couldn't construct the request for batch credit spread pricing.

**Change:** Added `horizons: f.result.horizons ?? []` to the per-ticker data in `buildComparison()`.

This is backward-compatible — the web app's existing code doesn't use `horizons` on compare results, so no web-side changes are needed.

---

### Button Order Fix on Forecast Screen

**File:** `mobile/src/screens/ForecastScreen.tsx`

The "Get AI Credit Spread Analysis" button (basic, no pricing) was below the "Analyze with Pricing" button (premium). The user requested the simpler analysis button appear first.

**Before:**
1. Analyze with Pricing (green button)
2. Get AI Credit Spread Analysis (outline button)

**After:**
1. Get AI Credit Spread Analysis (outline button)
2. Analyze with Pricing (green button)

---

### Debug Logging

Added `console.log` / `console.error` statements throughout the feature flow:

**Mobile (`mobile/src/store/forecastStore.ts`):**
- `[premiumAnalysis]` prefix — logs credit spread fetch, cache usage, API calls, errors with status codes
- `[premiumNarrative]` prefix — logs ticker horizon counts, batch requests, results, errors

**Server:**
- `[spreads/premium-aware]` — logs ticker, spot, horizon/spread counts on entry
- `[credit-spreads/batch]` — logs per-ticker progress, contract counts, success/failure summary
- `[compare/premium-narrative]` — logs ticker count, pricing data tickers, narrative length

---

## Files Changed

| File | Changes |
|---|---|
| `server/routes/spreads.js` | Added `POST /premium-aware` route + `buildPricingDataBlock()` helper |
| `server/routes/forecast.js` | Added `POST /credit-spreads/batch` route |
| `server/routes/compare.js` | Added `POST /premium-narrative` route + `generatePremiumNarrative()` |
| `server/compare.js` | Added `horizons` field to `buildComparison()` output |
| `mobile/src/screens/ForecastScreen.tsx` | Reordered buttons (spread analysis above analyze with pricing) |
| `mobile/src/store/forecastStore.ts` | Added debug logging to `fetchPremiumAnalysis` and `fetchPremiumNarrative` |

---

## Mobile API Client Reference

All three new endpoints have corresponding methods in `mobile/src/services/api.ts` (these already existed but had no server implementation):

```typescript
// Single-ticker premium analysis
api.fetchPremiumAwareSpreadAnalysis(forecast, creditSpreads) → string
  // POST /api/forecast/spreads/premium-aware (timeout: 120s)

// Batch credit spread pricing
api.fetchBatchCreditSpreads(tickers) → BatchCreditSpreadsResult
  // POST /api/forecast/credit-spreads/batch (timeout: 300s)

// Multi-ticker premium narrative
api.fetchPremiumNarrative(comparison, spreadsByTicker) → string
  // POST /api/compare/premium-narrative (timeout: 120s)
```

---

## Mobile State Management

The Zustand store (`mobile/src/store/forecastStore.ts`) manages:

### Single-Ticker State
| Field | Type | Description |
|---|---|---|
| `premiumAnalysis` | `string \| null` | The AI analysis text |
| `premiumAnalysisLoading` | `boolean` | Loading spinner |
| `premiumAnalysisError` | `string \| null` | Error message |
| `creditSpreads` | `CreditSpreadPricingResult \| null` | Cached pricing (reused if already loaded) |

### Multi-Ticker State
| Field | Type | Description |
|---|---|---|
| `premiumNarrative` | `string \| null` | The AI narrative text |
| `premiumNarrativeLoading` | `boolean` | Loading spinner |
| `premiumNarrativeError` | `string \| null` | Error message |
| `premiumNarrativeProgress` | `string \| null` | Status text ("Fetching pricing...", "Generating analysis...") |
| `spreadsByTicker` | `Record<string, CreditSpreadPricingResult> \| null` | Cached batch pricing |

Both actions (`fetchPremiumAnalysis`, `fetchPremiumNarrative`) cache credit spread data to avoid re-fetching if the user regenerates the analysis.

---

## Testing Checklist

### Single-Ticker (Forecast Screen)
- [ ] Enter a ticker (e.g., TSLA) and get forecast
- [ ] Tap "Get AI Credit Spread Analysis" — should work (basic, no pricing)
- [ ] Tap "Analyze with Pricing" — should fetch credit spreads then generate analysis
- [ ] Verify analysis mentions actual dollar premiums from live pricing
- [ ] Tap "Refresh Analysis with Pricing" — should reuse cached credit spreads
- [ ] Check console logs for `[premiumAnalysis]` debug output

### Multi-Ticker (Compare Screen)
- [ ] Compare 2+ tickers (e.g., AAPL, TSLA, COIN)
- [ ] Tap "Generate AI Narrative" — should work (basic, no pricing)
- [ ] Tap "Analyze with Pricing" — should show progress ("Fetching credit spread pricing...")
- [ ] Verify narrative mentions actual premiums per ticker
- [ ] Check console logs for `[premiumNarrative]` and `[credit-spreads/batch]` output
- [ ] Verify no "No horizon data available" error

### Server Logs
- [ ] Check for `[spreads/premium-aware]` log on single-ticker analysis
- [ ] Check for `[credit-spreads/batch]` logs showing per-ticker progress
- [ ] Check for `[compare/premium-narrative]` log on multi-ticker analysis
