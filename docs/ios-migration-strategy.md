# ForecastRange — iOS App Migration Strategy

## Executive Summary

ForecastRange is a full-stack web application (React + Node.js/Express + PostgreSQL) built for options traders to forecast stock price ranges and evaluate premium-selling opportunities. The web app and database are already deployed on Railway. This document outlines the strategy to build a native iOS app.

### Confirmed Decisions

| Decision | Choice |
|----------|--------|
| **Framework** | React Native + Expo (managed workflow) |
| **Authentication** | OAuth — Sign in with Apple + Google Sign-In |
| **Monetization** | Free (no subscription or in-app purchases) |
| **Native Features** | All — Watchlist, Push Notifications, Home Screen Widget, Offline Mode, Biometric Auth |

---

## 1. Current Architecture Overview

| Layer        | Technology                          | Key Details                                      |
|------------- |------------------------------------ |------------------------------------------------- |
| Frontend     | React 18 + TypeScript + TailwindCSS | SPA with tabs (Forecast, Compare)                |
| Charts       | Recharts                            | Forecast cone visualization                      |
| Backend      | Node.js + Express 4                 | REST API on port 3000                            |
| Database     | PostgreSQL + Drizzle ORM            | IV history storage, forecast schema              |
| Market Data  | Polygon.io REST API                 | Daily OHLCV bars, options chain snapshots         |
| AI Features  | Anthropic Claude API                | Credit spread suggestions, comparative narratives |
| Core Engine  | Pure JavaScript (src/)              | Forecast computation, indicators, volatility      |
| Build        | Vite 5                              | Dev server + production build                    |

### Current Feature Set
- **Single-ticker forecast** — 1–4 week horizons with probability bands (50%, 68%, 90%)
- **Forecast cone chart** — Visual area chart of price range projections
- **Multi-ticker comparison** — Rank 2–10 tickers by premium-selling attractiveness
- **AI credit spread analysis** — Claude-powered trade recommendations
- **AI comparative narrative** — Natural language summary of multi-ticker comparison
- **IV history tracking** — Historical implied volatility with auto-backfill
- **Markdown export** — Export forecasts and comparisons

---

## 2. iOS Approach Options

### Option A: React Native (Recommended)

**Approach:** Rewrite the UI in React Native while preserving the core forecast engine and backend.

| Pros | Cons |
|------|------|
| Leverages existing React/TypeScript skills | Not fully native — some performance ceiling |
| Core forecast logic (src/) reusable as-is in JS | Chart libraries differ from web Recharts |
| Large ecosystem, strong community | Occasional native bridge issues |
| Single codebase for iOS + Android later | App Store review can be stricter for hybrid |
| Faster development than full native rewrite | |

**Chart Library:** Replace Recharts with `react-native-wagmi-charts` or `victory-native` for the cone chart.

**Estimated Effort:** 8–12 weeks (1 developer)

---

### Option B: Swift Native (SwiftUI)

**Approach:** Full native rewrite of the UI in SwiftUI, port the forecast engine to Swift, keep the backend as a hosted API.

| Pros | Cons |
|------|------|
| Best performance and native feel | Highest effort — full UI + engine rewrite |
| Full access to iOS APIs (widgets, notifications) | Forecast engine must be ported to Swift |
| Apple review friendliest | No Android reuse |
| Swift Charts for native visualizations | Requires Swift/iOS expertise |

**Estimated Effort:** 14–20 weeks (1 experienced iOS developer)

---

### Option C: Capacitor/Ionic Wrapper

**Approach:** Wrap the existing React web app in a native shell using Capacitor.

| Pros | Cons |
|------|------|
| Fastest path — minimal code changes | WebView-based, feels like a web app |
| Reuse 90%+ of existing frontend code | Performance limitations on charts |
| Quick proof of concept | May face App Store rejection for being a glorified web wrapper |
| Still deploys as native app | Limited access to native APIs |

**Estimated Effort:** 2–4 weeks (1 developer)

---

### Option D: Progressive Web App (PWA)

**Approach:** Convert the existing web app to a PWA with offline support and home screen install.

| Pros | Cons |
|------|------|
| Zero native code needed | No App Store presence |
| Works immediately on all platforms | Limited push notification support on iOS |
| Minimal effort | No native feel or gestures |
| Easy to maintain single codebase | Users must know to "Add to Home Screen" |

**Estimated Effort:** 1–2 weeks (1 developer)

---

## 3. Recommended Strategy: React Native (Option A)

React Native offers the best balance of development speed, code reuse, and native user experience. The existing JavaScript forecast engine can be reused directly, and the team's React/TypeScript expertise transfers.

---

## 4. Architecture for iOS

```
┌─────────────────────────────────────────────┐
│              iOS App (React Native)          │
│                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  │
│  │ Forecast  │  │  Compare  │  │ Settings │  │
│  │  Screen   │  │  Screen   │  │  Screen  │  │
│  └────┬─────┘  └─────┬─────┘  └──────────┘  │
│       │               │                      │
│  ┌────┴───────────────┴─────┐                │
│  │     API Service Layer     │                │
│  │  (shared fetch + cache)   │                │
│  └────────────┬──────────────┘                │
└───────────────┼──────────────────────────────┘
                │ HTTPS
                ▼
┌────────────────────────────────────────────────────┐
│    Existing Railway Deployment (Node.js/Express)   │
│    + PostgreSQL (Railway)                          │
│                                                    │
│  /api/forecast   /api/compare   /api/spreads       │
│  /api/auth (new) /api/watchlist (new)              │
│         │              │              │             │
│    ┌────┴──────────────┴──────────────┘             │
│    │  Core Forecast Engine (src/)                   │
│    │  Polygon.io ↔ PostgreSQL ↔ Claude API         │
│    └────────────────────────────────────────        │
└────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **Backend already hosted on Railway** — The web app and PostgreSQL database are already deployed on Railway. The iOS app can point directly at the existing backend API. No new hosting setup needed — just add iOS-specific endpoints (auth, watchlist, push notifications) to the existing server.

2. **Thin client** — The iOS app is a presentation layer that calls the existing REST API. This keeps the app lightweight and allows server-side updates without app releases.

3. **Add OAuth authentication** — The web app currently has no auth. The iOS app needs user accounts via Sign in with Apple + Google Sign-In to:
   - Protect API access
   - Enable per-user watchlists and saved forecasts
   - Comply with App Store requirements (Apple Sign-In required when offering social login)

4. **Add caching** — Cache recent forecasts on-device to reduce API calls and support offline viewing of last-fetched data.

---

## 5. Phased Implementation Plan

### Phase 1: Foundation (Weeks 1–3)

| Task | Details | Effort |
|------|---------|--------|
| Project setup | React Native + TypeScript + navigation (React Navigation) | 2 days |
| Backend config | Add iOS API endpoints to existing Railway deployment | 0.5 days |
| API client | Port `api.ts` to React Native with proper error handling | 1 day |
| Authentication | OAuth (Apple + Google) + JWT tokens on backend | 3–4 days |
| Environment config | API keys, base URLs, env management | 0.5 days |
| CI/CD setup | Fastlane or EAS Build for automated builds | 1–2 days |

**Deliverable:** App skeleton that can authenticate and call the backend.

---

### Phase 2: Core Forecast Feature (Weeks 4–6)

| Task | Details | Effort |
|------|---------|--------|
| Forecast screen | Ticker input, loading states, error handling | 2 days |
| Cone chart | Reimplement using Victory Native or react-native-svg | 3–4 days |
| Forecast table | Horizon rows with expected moves, ranges, skew | 2 days |
| Forecast details | Expandable sections (trend, volatility, blending, S/R) | 2–3 days |
| Dark theme | Port TailwindCSS dark theme to React Native StyleSheet | 1–2 days |
| Pull-to-refresh | Refresh forecast on pull gesture | 0.5 days |

**Deliverable:** Fully functional single-ticker forecast with chart and details.

---

### Phase 3: Compare & AI Features (Weeks 7–9)

| Task | Details | Effort |
|------|---------|--------|
| Compare screen | Multi-ticker input (2–10), ranking display | 2–3 days |
| Comparison cards | Medal rankings, composite scores, per-ticker metrics | 2–3 days |
| AI narrative | Claude-generated comparison summary | 1 day |
| Spread analysis | Credit spread recommendations per forecast | 1–2 days |
| Markdown export | Share sheet integration for exporting forecasts | 1–2 days |
| Haptic feedback | Subtle haptics on key interactions | 0.5 days |

**Deliverable:** Feature parity with the web app.

---

### Phase 4: iOS-Native Enhancements (Weeks 10–12)

| Task | Details | Effort |
|------|---------|--------|
| Watchlist | Save favorite tickers, quick-access list | 2–3 days |
| Push notifications | Alert when IV percentile crosses thresholds | 3–4 days |
| Widget (WidgetKit) | Home screen widget showing top ticker's forecast range | 2–3 days |
| Offline mode | Cache last forecasts, show stale data indicator | 1–2 days |
| Biometric auth | Face ID / Touch ID for app lock | 0.5 days |
| App Store assets | Screenshots, description, privacy policy | 1–2 days |
| TestFlight beta | Internal testing distribution | 1 day |

**Deliverable:** iOS-native features that differentiate from the web experience.

---

### Phase 5: Polish & Launch (Weeks 12–14)

| Task | Details | Effort |
|------|---------|--------|
| Performance optimization | Lazy loading, memoization, reduce re-renders | 2 days |
| Accessibility | VoiceOver support, dynamic type, contrast | 2 days |
| Analytics | Event tracking (screen views, forecast requests) | 1 day |
| Crash reporting | Sentry or Crashlytics integration | 0.5 days |
| App Store submission | Review guidelines compliance, metadata | 1–2 days |
| Bug fixes & QA | Testing on multiple devices and iOS versions | 3–5 days |

**Deliverable:** App Store–ready build.

---

## 6. Effort Summary

| Phase | Duration | Key Output |
|-------|----------|------------|
| Phase 1: Foundation | 3 weeks | Auth + backend deployment + project scaffold |
| Phase 2: Core Forecast | 3 weeks | Single-ticker forecast with cone chart |
| Phase 3: Compare & AI | 3 weeks | Feature parity with web app |
| Phase 4: iOS Enhancements | 3 weeks | Watchlist, widgets, notifications, offline |
| Phase 5: Polish & Launch | 2 weeks | App Store submission |
| **Total** | **~14 weeks** | **Full iOS app with native features** |

**Team size:** 1 experienced React Native developer (full-time)
**With 2 developers:** Can compress to ~8–10 weeks by parallelizing frontend and backend/infra work.

---

## 7. Technology Stack (React Native)

| Category | Technology | Replaces |
|----------|-----------|----------|
| Framework | React Native 0.76+ | React DOM |
| Language | TypeScript | Same |
| Navigation | React Navigation 7 | Tab-based routing in App.tsx |
| Charts | Victory Native or react-native-skia | Recharts |
| Icons | Lucide React Native | Lucide React |
| State | Zustand or React Context | useState hooks |
| HTTP | Axios or fetch | fetch |
| Auth | OAuth (Apple + Google) + expo-secure-store for JWT | None (new) |
| Push | Firebase Cloud Messaging (FCM) or APNs | None (new) |
| Storage | AsyncStorage + MMKV | None (new) |
| Build | EAS Build (Expo) or Fastlane | Vite |
| Testing | Jest + React Native Testing Library | None |

---

## 8. Backend Changes Required

The existing Express backend needs these additions to support the iOS app:

### 8.1 Authentication — OAuth (New)
- **POST /api/auth/apple** — Verify Apple identity token, create/find user, return JWT
- **POST /api/auth/google** — Verify Google OAuth token, create/find user, return JWT
- **POST /api/auth/refresh** — Refresh expired access tokens
- **Middleware** — JWT verification on all `/api/forecast`, `/api/compare` routes
- **User table** — New PostgreSQL table (`id`, `provider`, `provider_id`, `email`, `name`, `created_at`)
- **Libraries:** `apple-signin-auth` (server-side Apple token verification), `google-auth-library`

### 8.2 Watchlist & Preferences (New)
- **GET /api/watchlist** — Fetch user's saved tickers
- **POST /api/watchlist** — Add ticker to watchlist
- **DELETE /api/watchlist/:ticker** — Remove ticker
- **PATCH /api/preferences** — User settings (default horizons, notification thresholds)

### 8.3 Push Notifications (New)
- **POST /api/devices** — Register device token for APNs
- **Background job** — Periodic IV percentile checks for watchlist tickers
- **APNs integration** — Send alerts when thresholds crossed

### 8.4 Rate Limiting & Security
- Rate limiting per user (e.g., 60 forecasts/hour)
- HTTPS enforcement
- API versioning (e.g., `/api/v1/forecast`)
- Input sanitization (already partially present)

### 8.5 Hosting (Already on Railway)
- **Current setup:** Web app + Express backend + PostgreSQL already deployed on Railway
- **For iOS:** No new hosting needed — add new routes to existing server, push to Railway
- **Scaling consideration:** Monitor Railway usage as mobile users increase; may need to upgrade plan
- **Domain + SSL:** Railway provides HTTPS by default; ensure custom domain is configured for iOS ATS compliance

---

## 9. Code Reuse Assessment

| Component | Reusable? | Notes |
|-----------|-----------|-------|
| `src/forecast.js` | 100% | Runs on backend, no changes needed |
| `src/indicators.js` | 100% | Pure math, backend-only |
| `src/volatility.js` | 100% | Pure math, backend-only |
| `src/polygon.js` | 100% | Backend-only API calls |
| `src/structure.js` | 100% | Pure math, backend-only |
| `src/scoring.js` | 100% | Pure math, backend-only |
| `client/src/api.ts` | 80% | TypeScript interfaces fully reusable; fetch calls need minor adaptation |
| `client/src/exportMarkdown.ts` | 90% | Logic reusable, share mechanism changes |
| `server/routes/*` | 100% | No changes for existing routes |
| `server/db.js` | 100% | Backend-only |
| `client/src/components/*` | 0–20% | UI must be rewritten for React Native (logic patterns reusable, JSX/styling not) |

**Overall code reuse: ~60–70%** (backend untouched, API types shared, UI rewritten)

---

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| App Store rejection (financial advice concerns) | High | Medium | Add disclaimers; frame as "educational/informational tool, not financial advice" |
| Polygon.io rate limits under multiple users | Medium | Medium | Server-side caching of recent bars (5-min TTL); batch requests |
| Chart performance on older iPhones | Medium | Low | Use Skia-based rendering; test on iPhone SE |
| Claude API costs scaling with users | Medium | Medium | Cache AI responses for same inputs; limit AI calls per user/day |
| React Native version compatibility issues | Low | Medium | Pin RN version; use Expo managed workflow for stability |
| Backend downtime affects all users | High | Low | Health checks, auto-restart, basic monitoring (UptimeRobot) |

---

## 11. App Store Considerations

### Required
- **Privacy policy** — Disclose data collection (email, API usage, financial tickers searched)
- **Terms of service** — Financial disclaimer ("not investment advice")
- **App Privacy labels** — Declare data types collected
- **Minimum iOS version** — iOS 16+ (covers ~95% of active devices)

### Recommended
- **App Review notes** — Explain the app calculates statistical forecasts, does not execute trades
- **Demo account** — Provide Apple reviewer with test credentials

### Content Rating
- **Age rating:** 4+ (no objectionable content)
- **Category:** Finance

---

## 12. Access Control — Personal Use Only (For Now)

**Goal:** Restrict the iOS app to only the owner/developer initially.

### Options for Locking Down Access

| Method | How It Works | Effort |
|--------|-------------|--------|
| **TestFlight only (Recommended)** | Don't publish to App Store. Distribute via TestFlight to your Apple ID only. No auth needed. | Zero effort |
| **Allowlist on backend** | After OAuth login, check if the user's email/Apple ID matches an allowlist in the DB or env var. Reject all others. | 1 hour |
| **Invite code** | Require a secret code on first launch. Only you know the code. | 0.5 days |

**Recommended approach:** Use **TestFlight** during development — it's private by default (up to 100 internal testers). When you're ready for others, add an **email allowlist** on the backend:

```javascript
// server middleware example
const ALLOWED_USERS = (process.env.ALLOWED_EMAILS || '').split(',');

function restrictAccess(req, res, next) {
  if (ALLOWED_USERS.length > 0 && !ALLOWED_USERS.includes(req.user.email)) {
    return res.status(403).json({ error: 'Access restricted' });
  }
  next();
}
```

This lets you gradually open access by adding emails to the `ALLOWED_EMAILS` env var on Railway without code changes.

---

## 13. Monetization (N/A — Free)

**Decision: Free** — No subscription or in-app purchases. The app is for personal use. API costs (Polygon, Claude, Railway) are absorbed by the developer. This simplifies development (no StoreKit integration, no paywall logic) and App Store review.

---

## 14. Expo Managed Workflow (Confirmed)

Using **Expo** instead of bare React Native simplifies development significantly:

| Benefit | Detail |
|---------|--------|
| No Xcode config headaches | EAS Build handles native compilation in the cloud |
| OTA updates | Push JS updates without App Store review (Expo Updates) |
| Easier push notifications | expo-notifications handles APNs setup |
| Secure storage | expo-secure-store for JWT tokens |
| Simpler CI/CD | EAS Submit for App Store uploads |

**Trade-off:** Less control over native modules, but ForecastRange doesn't need custom native code.

**Recommendation:** Start with Expo managed workflow. Eject to bare workflow only if a native module is needed later.

---

## 15. Quick-Start Checklist

- [x] Choose approach — React Native + Expo
- [x] Choose auth — OAuth (Apple + Google)
- [x] Choose monetization — Free
- [x] Choose native features — All (watchlist, push, widget, offline)
- [ ] Set up Expo project with TypeScript template
- [ ] Add OAuth endpoints to Railway backend (Apple + Google)
- [ ] Build Forecast screen with cone chart
- [ ] Build Compare screen with ranking cards
- [ ] Integrate AI features (spreads + narrative)
- [ ] Add watchlist and local caching
- [ ] Configure push notifications
- [ ] Build home screen widget
- [ ] Write privacy policy and terms of service
- [ ] TestFlight beta testing
- [ ] Submit to App Store

---

*Document created: 2026-03-12*
*Repository: schiang418/ForecastRange*
