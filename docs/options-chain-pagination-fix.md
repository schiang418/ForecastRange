# Options Chain Pagination Fix

## Issue: iOS Frontend Shows Empty Data After Expiration Processing Change

**Date:** 2026-03-14
**Branch:** `claude/merge-ekmd7-branch-EcIs3`
**Status:** Fixed

---

## Problem

The forecast endpoint was only returning data for **1 expiration** because `fetchOptionsChain` fetches a single page (250 contracts) from the Polygon API. This is insufficient for IV term structure interpolation, which requires multiple expirations to bracket each forecast horizon.

A previous session attempted to fix this by switching the forecast route to use `fetchOptionsForExpiration` (fully paginated), but this caused **iOS empty data** because the unlimited pagination fetched thousands of contracts, exceeding the mobile 30-second timeout.

## Root Cause Analysis

Three functions involved, each with different trade-offs:

| Function | Pagination | Contracts | Problem |
|---|---|---|---|
| `fetchOptionsChain` | None (1 page) | ~250 | Only 1 expiration for most tickers |
| `fetchOptionsForExpiration` | Unlimited | Thousands | Timeouts on mobile (30s limit) |
| **Needed** | Capped pagination | ~1000 | Multiple expirations, no timeout |

### Data flow

```
Polygon API (options chain)
  -> extractAtmIV()       -> expirationIVs[]   (needs multiple expirations)
  -> extractAtmStraddle() -> straddleData[]     (needs multiple expirations)
  -> getIVForHorizon()    -> interpolates IV between bracketing expirations
  -> getStraddleMoveForHorizon() -> interpolates expected move
  -> blended forecast per horizon (1W, 2W, 3W, 4W)
```

Without multiple expirations, the interpolation has no bracketing data and falls back to a single IV value for all horizons.

## Fix Applied

Aligned with main branch's architecture:

1. **`fetchOptionsChain`** - Kept as simple single-page fetch (250 contracts). Used as fallback only.

2. **`fetchOptionsForExpiration`** - Added `maxPages` parameter:
   - `maxPages = 0` (default): unlimited pagination, backward compatible
   - `maxPages = N`: stops after N pages

3. **Forecast route** (`server/routes/forecast.js`):
   ```javascript
   // Before (broken - only 1 expiration):
   fetchOptionsChain(cleanTicker)

   // Main branch (works on web, times out on iOS):
   fetchOptionsForExpiration(cleanTicker)

   // Fix (works on both web and iOS):
   fetchOptionsForExpiration(cleanTicker, null, null, 4)  // max 4 pages = ~1000 contracts
   ```

4. **Credit spreads route** - Unchanged, still uses unlimited pagination since it needs full strike discovery and runs on-demand (not blocking initial page load).

## Files Changed

- `src/polygon.js` - Added `maxPages` param to `fetchOptionsForExpiration`, reverted `fetchOptionsChain` to match main
- `server/routes/forecast.js` - Switched to `fetchOptionsForExpiration` with `maxPages=4`

## Why maxPages=4?

- 4 pages x 250 contracts = up to 1,000 contracts
- Typically covers 4-8 expiration dates (enough for 4-week forecast horizons)
- ~1 second of API time (4 requests x 200ms rate-limit delay)
- Well within iOS 30-second timeout even with OHLCV fetch running in parallel

## Testing Checklist

- [ ] Forecast returns multiple `ivExpirations` (check response JSON)
- [ ] Forecast returns multiple `straddleExpirations`
- [ ] IV term structure shows `interpolated: true` for middle horizons
- [ ] iOS app loads forecast data without timeout
- [ ] Credit spreads still work (unlimited pagination path)

## Timeline

| Commit | Change | Result |
|---|---|---|
| (earlier) | Used `fetchOptionsChain` (1 page) | Only 1 expiration, no interpolation |
| (previous session) | Switched to `fetchOptionsForExpiration` (unlimited) | iOS timeout, empty data |
| (previous session) | Reverted to `fetchOptionsChain` | Back to 1 expiration |
| `15d13d8` | `fetchOptionsForExpiration` with `maxPages=4` | Multiple expirations, no timeout |
