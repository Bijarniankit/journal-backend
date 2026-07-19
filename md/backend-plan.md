# Backend Plan — NestJS (apps/api) + Prisma + Supabase

Companion to `frontend-plan.md`. Same 10 phases, same phase numbers, same shared contract in `packages/shared` — the backend dev owns writing that contract's Zod schemas each phase, the frontend dev consumes them.

> **Revision note.** This version incorporates the reviewed gap decisions: multi-currency (GAP-03), first-class strategies (GAP-04), planned Risk/Reward semantics (GAP-05), asset classes / single-leg scope (GAP-06), cumulative-P&L equity computed on read (GAP-08, which also resolves the GAP-02 rollup-backfill bug), one strategy per trade (GAP-09), pinned `summary` vs `performance` contracts (GAP-11, plus `range` on the heatmap endpoint, GAP-10), and Supabase Auth with Bearer tokens (GAP-12). **Trade replay is out of scope.** **SnapTrade (GAP-01) remains future backlog** — its groundwork (the `SNAPTRADE` source, the dedup collision design, and the `BrokerConnection` stub) is retained but no sync is built in these 10 phases.

---

## 0. Conventions & Base Setup (read once, applies to every phase)

**Stack:** NestJS + TypeScript, Prisma ORM against Supabase Postgres, `nestjs-zod` (DTOs derived from `packages/shared` schemas — write the schema once, use it for both validation and typing), BullMQ + Redis (Upstash) for background jobs (provisioned now, first real use is deferred), Supabase Storage for files, Passport for Supabase JWT verification.

**Auth (decided — GAP-12):** authentication is **Supabase Auth**. The frontend sends the Supabase session **access token as a `Bearer` header**; NestJS verifies that JWT (Passport strategy against Supabase's JWKS/secret) and never re-implements sessions or password hashing. No cookie-based transport — this is locked in Phase 0.

**Folder structure (`apps/api/src`):**
```
modules/
  auth/            -- JWT strategy, guards
  profiles/
  trades/          -- entry point for Phase 1, grows through Phase 2
  strategies-tags/
  imports/         -- Phase 2
  analytics/       -- Phases 3-6 (summary, equity, drawdown, performance, calendar, by-dimension, heatmap)
  rules/           -- Phase 7
  challenges/      -- Phase 8
common/
  guards/, filters/, pipes/, decorators/   -- e.g. @CurrentUser(), tenant-scoping helpers
prisma/
  schema.prisma
  migrations/
```

**Module pattern (use for every feature module):** `*.controller.ts` (routes, thin), `*.service.ts` (business logic), `*.repository.ts` only if the Prisma queries get complex enough to warrant separating. Each module exports its Zod-derived DTOs into `packages/shared` so the frontend gets them for free.

**Money & currency (decided — GAP-03):** every trade stores its own `currency` (ISO 4217) and an `fxToBase` rate captured at trade time; the backend computes and stores `netPnlBase = netPnl * fxToBase`. **All analytics, rollups, and aggregates operate on `netPnlBase`** (the user's `baseCurrency`), never on the raw `netPnl`. For same-currency trades `fxToBase = 1`. The source of the rate for cross-currency trades is a product decision (manual entry on the trade, or a daily-rate lookup at ingest); default to `1` and flag any non-base currency without a rate.

**Tenant scoping (non-negotiable, every query, every phase):** every Prisma query touching a user-owned table includes `where: { userId: currentUser.id, ... }`. Supabase RLS is on as an independent second layer, but the API guard is what actually protects the data — never rely on RLS alone.

**Testing baseline:** Jest unit tests for every computation (P&L, currency conversion, metrics, rule engine) against hand-calculated fixtures; Supertest for endpoint contract tests (status, shape, tenant isolation — user A can never fetch user B's data).

**Deferred / out of scope (tracked, not forgotten):** SnapTrade sync (GAP-01), multi-leg option spreads (GAP-06 — v1 is single-leg only), and realized R-multiple as a separate metric (GAP-05 — only planned R:R ships).

---

## Phase 0 — Foundations

**What.** Auth verification, base schema, deployable API skeleton.

**How.**
- Prisma schema: `Profile` — `id` (UUID, = `auth.users.id`), `email`, `displayName`, `timezone` (default `'UTC'`), `baseCurrency` (ISO 4217, default `'USD'` or `'INR'` — confirm with the user), `startingBalance` (Decimal, default `0` — used to offset the equity curve, see Phase 3), `createdAt`.
- `AuthModule`: a Passport strategy that verifies the Supabase-issued JWT using Supabase's JWT secret/JWKS. NestJS only verifies tokens; Supabase Auth owns identity entirely.
- `JwtAuthGuard` applied globally except an explicit `@Public()` allowlist.
- `GET /me` — returns the current `Profile`, creating it on first call if absent (Supabase Auth may have created the user before our first API hit).
- Error envelope: global `HttpExceptionFilter` returning `{ error: { code, message } }`.
- CI/CD: Dockerfile for the API, GitHub Actions building + deploying to Railway staging on merge to `main`. Redis (Upstash) configured; BullMQ module registered but no processors yet.
- Security baseline: `helmet()`, CORS locked to the frontend origin, `@nestjs/throttler` global (e.g. 100 req/min/IP, tighter on auth-adjacent routes).

**Integration checkpoint.** Frontend signs up through Supabase Auth → hits `GET /me` with the Bearer access token → gets a real profile row, not a mock.

**Definition of done.** Auth guard rejects missing/invalid tokens and accepts valid Supabase JWTs; `Profile` populated; staging deploy green.

---

## Phase 1 — Trade Journal Core

**What.** Trade CRUD with computed fields, first-class strategies, tags.

**How.**
- Prisma schema additions:
  ```
  model Trade {
    id                String   @id @default(uuid())
    userId            String
    symbol            String
    assetClass        AssetClass        // EQUITY | OPTION | FUTURE | FOREX | CRYPTO  (GAP-06)
    entryPrice        Decimal
    exitPrice         Decimal?
    quantity          Decimal
    direction         TradeDirection    // LONG | SHORT
    stopLoss          Decimal?          // planned-risk input for R:R (GAP-05)
    takeProfit        Decimal?
    currency          String            // ISO 4217, defaults to profile.baseCurrency (GAP-03)
    fxToBase          Decimal @default(1)
    openedAt          DateTime
    closedAt          DateTime?
    notes             String?
    netPnl            Decimal?          // in trade currency, computed & stored on write
    netPnlBase        Decimal?          // = netPnl * fxToBase; analytics aggregate THIS (GAP-03)
    plannedRiskReward Decimal?          // from stop/target; null if either absent (GAP-05)
    strategyId        String?           // single first-class strategy FK (GAP-04, GAP-09)
    source            TradeSource       // MANUAL | IMPORT | SNAPTRADE
    externalId        String?
    createdAt         DateTime @default(now())
    @@unique([userId, source, externalId])
    @@index([userId, openedAt])
    @@index([userId, strategyId])
  }
  model Strategy { id, userId, name }              // first-class entity (GAP-04)
  model Tag      { id, userId, name }              // behavioural/mistake labels only (GAP-04: no type enum)
  model TradeTag { tradeId, tagId }
  // No TradeStrategy join — one strategy per trade via Trade.strategyId (GAP-09)
  ```
  **Decisions baked in:**
  - **Strategies are first-class** (`Strategy` entity + single `strategyId` FK). The old `Tag.type = STRATEGY` is gone; tags are now purely behavioural/context labels (FOMO, revenge, session, etc.) that drive "which tags lose money" (GAP-04). One strategy per trade (GAP-09).
  - **`assetClass`** is stored so v1 supports single-leg trades across stocks, options, futures, forex and crypto, and analytics can segment by class. **Multi-leg option spreads are out of scope for v1** (GAP-06) — revisit with a positions/legs model later.
  - **`stopLoss`/`takeProfit`** are the confirmed planned-risk inputs; `plannedRiskReward` is the *planned* reward-to-risk ratio, not a realized outcome (GAP-05).
- `TradesService.computeMetrics(trade)`:
  - `netPnl = (exitPrice - entryPrice) * quantity * (direction === 'LONG' ? 1 : -1)` (trade currency)
  - `netPnlBase = netPnl * fxToBase`
  - `plannedRiskReward = (stopLoss && takeProfit) ? |takeProfit - entryPrice| / |entryPrice - stopLoss| : null`
  - Computed on every create/update, stored (never recomputed on read).
- CRUD endpoints (`POST/GET/PATCH/DELETE /trades`) with `nestjs-zod` validation, pagination (`page`, `pageSize`, default sort `openedAt desc`), filters (`symbol`, `strategyId`, `tagId`, `direction`, `assetClass`).
- Strategy/Tag CRUD — user-scoped, unique-per-user-per-name.

**Testing.** Unit tests for `computeMetrics` (long/short win/loss, missing stop/target → null R:R, non-base currency conversion). Supertest: CRUD + a tenant-isolation test.

**Integration checkpoint.** Hand the frontend 3–5 fixture trades (incl. one non-base-currency) with hand-calculated `netPnl`, `netPnlBase`, `plannedRiskReward` to verify display matches exactly.

**Definition of done.** Trade CRUD correct, tenant-isolated, currency-converted, and computed fields verified against fixtures.

---

## Phase 2 — CSV/Excel Import & Screenshots

**What.** Server-side parse/validate/dedup for bulk import; presigned uploads for screenshots.

**How.**
- Prisma additions: `Import { id, userId, status, rowErrors Json, mappingTemplateId, createdAt }`, `MappingTemplate { id, userId, name, columnMap Json }`, `TradeScreenshot { id, tradeId, storagePath, label, createdAt }`.
- `POST /imports`: accepts the file (multipart) + confirmed column mapping. Parse server-side (`papaparse`/`xlsx`), coerce types/dates, validate each row against `TradeSchema`, collect row-level errors instead of failing the batch. **The mapping includes `currency` and `assetClass`** (GAP-03/06); when a column is absent, default `currency` to `baseCurrency` (`fxToBase = 1`) and `assetClass` to `EQUITY`, and flag the assumption in the import result.
- **Dedup:** for rows without a natural external ID, derive a deterministic `externalId` as a hash of `(symbol, openedAt, quantity, entryPrice)` so re-importing the same file — or the same trade later arriving via SnapTrade — collides on `@@unique([userId, source, externalId])`. Reuse `TradesService.computeMetrics` (which now also fills `netPnlBase`).
- Processing runs synchronously for reasonable file sizes (a queued BullMQ job is over-engineering here — add later only if files get large enough to time out the request).
- `GET /imports/:id` returns status + `rowErrors`.
- Screenshots: `POST /trades/:id/screenshots/presign` returns a Supabase Storage signed upload URL; client uploads directly; `POST /trades/:id/screenshots/confirm` records the attachment after upload. The file never passes through NestJS.

**Testing.** Unit test the dedup hash. Supertest: import a fixture CSV → correct trade count + correct row errors on a malformed row; re-import → zero duplicates.

**Integration checkpoint.** Agree a shared CSV fixture with the frontend; both confirm identical resulting trades and zero duplicates on re-import.

**Definition of done.** Import is authoritative, de-duplicated, currency-aware, and error-transparent; screenshots persist.

---

## Phase 3 — Portfolio Dashboard & Global Date-Range Filter

**What.** Range resolution + the aggregation layer everything after this depends on.

**How.**
- Shared `RangeSchema` (Zod): preset token (`today`, `this_week`, `this_month`, `this_year`, `past_1_year`, `all_time`) or `{ from, to }` custom.
- `RangeResolverService.resolve(range, userTimezone)` → concrete UTC `{ from, to }`, timezone-aware (`this_year` = Jan 1 in the user's timezone). Used by **every** analytics endpoint through Phase 6 — get it right once here. Validate custom ranges (`from <= to`, sane max span) before resolving.
- Prisma addition — `DailySummary { userId, date, tradesCount, netPnl }` where **`netPnl` is in base currency** (sum of `netPnlBase` for that day). Updated incrementally in `TradesService` on every trade create/update/delete (recompute just that trade's date's row).
- **Equity & drawdown are computed on read, not stored (GAP-08, resolves GAP-02):** the equity curve is *cumulative realized P&L in base currency*, offset by `Profile.startingBalance`. Compute it as a running sum over `DailySummary.netPnl` within the range (SQL window function), and derive drawdown as the running peak minus current equity. Because nothing cumulative is stored, **inserting a back-dated trade can never leave a later day's equity stale** — the previous design's bug. (There is no external-funding model, so "equity" here means starting balance + cumulative realized P&L; label it as such in the UI.)
- Endpoints:
  - `GET /analytics/summary?range=` → the P&L overview tiles (GAP-11): `{ totalNetPnl, tradeCount, winCount, lossCount, byPeriod: { daily[], weekly[], monthly[] } }` — all in base currency.
  - `GET /analytics/equity?range=` → `[{ date, equity }]` (running cumulative, offset by starting balance).
  - `GET /analytics/drawdown?range=` → `[{ date, drawdown }]`.

**Testing.** Unit tests for `RangeResolverService` across timezones; a specific test that a **back-dated insert updates every later day's computed equity** (the regression that GAP-02 describes). Supertest: seeded dataset, assert summary/equity/drawdown per preset.

**Integration checkpoint.** Give the frontend a seeded account with documented expected numbers per preset; confirm exact match, including one back-dated insert.

**Definition of done.** Range resolution correct across timezones; equity/drawdown computed on read and correct after back-dated writes; summary contract pinned.

---

## Phase 4 — Analytics Dashboard

**What.** Win rate, profit factor, expectancy, avg win/loss, planned R:R, largest win/loss, streaks.

**How.**
- `GET /analytics/performance?range=` (GAP-11) returns exactly:
  - `winRate = wins / totalClosedTrades`
  - `profitFactor = sum(winning netPnlBase) / abs(sum(losing netPnlBase))`
  - `expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss)`
  - `avgWin`, `avgLoss`, `largestWin`, `largestLoss` (all base currency)
  - `avgPlannedRiskReward` **plus `tradesWithPlannedRR`** — so the UI can show the sample size, since `plannedRiskReward` is null for trades without a stop/target (GAP-05); the average is taken only over trades that have it.
  - `consecutiveWins` / `consecutiveLosses` — a running-streak scan in application code over the ordered trade list (cleaner to read/test than pure SQL).
- All monetary aggregation uses `netPnlBase`. Serve from `DailySummary` where possible; fall back to a direct `trades` query for streaks and planned-R:R (they need trade-level rows).

**Testing.** The phase to be most careful with — unit test every formula against a hand-built fixture (all wins, all losses, a tie, zero trades in range, a mix of trades with/without stops so `tradesWithPlannedRR` is exercised). Supertest against the Phase 3 seeded account.

**Integration checkpoint.** Hand off the exact expected numbers (not the formulas) for the shared fixture account; the frontend verifies against ground truth, not its own calculation.

**Definition of done.** All metrics correct against hand-verified fixtures, range-aware, with R:R sample size exposed.

---

## Phase 5 — Calendar, Strategy & Tag Analytics

**What.** Calendar aggregation + one generic dimension-grouping layer.

**How.**
- `GET /analytics/calendar?range=` — reads `DailySummary` for the range, returns per-day `{ date, netPnl, tradesCount }` (base currency). Feeds the frontend's ECharts calendar-heatmap. (Standardized from `month=YYYY-MM` to use `RangeQueryDto` for API consistency).
- `GroupByDimensionService.group(userId, dimension, range, includeOpen)` — one service, parameterized by `dimension: 'strategy' | 'tag'` (and later `'session' | 'dayOfWeek' | 'hour'` in Phase 6). Returns `[{ key, label, tradesCount, winRate, netPnl }]` in base currency. Strategy grouping uses `Trade.strategyId`; tag grouping uses `TradeTag` (smart distribution: if a trade has multiple tags, its PnL is counted against ALL of its tags for accurate isolated analysis).
- `GET /analytics/by-dimension?dimension=strategy|tag&range=&includeOpen=true|false`.

**Testing.** Unit test `GroupByDimensionService` for both dimensions against a fixture with a deliberately losing tag (verifies the "which tags lose money" case).

**Integration checkpoint.** Confirm calendar day totals and strategy/tag aggregates against a seeded month.

**Definition of done.** Calendar and both breakdowns correct and reusing the shared aggregation service.

---

## Phase 6 — Session, Day/Time Analytics & Heatmaps

**What.** Timezone-aware bucketing, heatmap matrix.

**How.**
- Extend `GroupByDimensionService` with `session` (Asian/London/NY), `dayOfWeek`, `hour` — all bucketed using the user's `timezone` from `Profile`, the same way `RangeResolverService` handles time.
- `GET /analytics/heatmap?type=day|session|strategy&range=` (GAP-10: `range` is part of the contract) — returns a matrix `{ rows: string[], cols: string[], cells: number[][] }` (base-currency P&L), pivoted from the same grouped data. Feeds the frontend's ECharts heatmap series.
- Session boundaries need one explicit decision now, documented in the endpoint's contract comment: e.g. Asian 00:00–08:00 UTC, London 08:00–16:00 UTC, NY 13:00–21:00 UTC (London/NY overlap is intentional) — confirm they suit your users before locking.

**Testing.** Unit test bucketing across at least two non-UTC timezones (catch the classic "11pm local lands in the wrong day-of-week bucket because stored UTC" bug).

**Integration checkpoint.** Test with a non-UTC profile timezone specifically — the phase most likely to hide a subtle timezone bug.

**Definition of done.** Session/day/hour breakdowns and heatmap matrix correct, timezone-safe, and range-aware.

---

## Phase 7 — Trading Plan Tracker

**What.** Rule persistence + evaluation engine.

**How.**
- Prisma: `Rule { id, userId, type, config Json, active }`, `RuleViolation { id, userId, ruleId, tradeId, occurredOn, detail }`.
- Rule `type` as a small fixed set (`MAX_TRADES_PER_DAY`, `MAX_RISK_PERCENT`, `NO_REVENGE_TRADING`), each with its own `config` shape (validated via a discriminated-union Zod schema — matches the frontend form).
- `RuleEngineService.evaluate(trade)` — runs **synchronously** inside `TradesService.create`/`update` (rule checks are cheap and must reflect immediately in the UI). Evaluates all active rules against the trade (and, for `MAX_TRADES_PER_DAY`, that day's existing trades) and writes `RuleViolation` rows for any breach.
- `GET /rules/violations?range=` — violations joined with trade/day info.

**Testing.** Unit test each rule type against just-barely-violate and just-barely-comply fixtures (boundary testing).

**Integration checkpoint.** Create a rule, log a violating trade, confirm the flag; deactivate the rule, confirm new trades stop being flagged.

**Definition of done.** Rule engine correct at boundaries, violations queryable and accurate.

---

## Phase 8 — Goals & Challenges

**What.** Challenge definitions + progress computation.

**How.**
- Prisma: `Challenge { id, name, definition Json, isPredefined }`, `ChallengeProgress { id, userId, challengeId, status, progress Json }`.
- Seed predefined challenges (20 trading days without a rule violation, 2:1 R:R challenge, no-overtrading challenge) as a Prisma seed script.
- `ChallengeProgressService` — reuses `RuleViolation` data from Phase 7 where a challenge is rule-based (e.g. "20 days without breaking rules" = count consecutive days with zero `RuleViolation` rows), so this phase is mostly composition.
- `GET /challenges`, `POST /challenges/:id/join`, `GET /challenges/progress`.

**Testing.** Unit test progress computation for each predefined challenge against fixture trade/violation histories.

**Integration checkpoint.** Join a challenge, log qualifying/disqualifying trades, confirm progress matches expected state.

**Definition of done.** Challenge join/progress correct end-to-end.

---

## Phase 9 — Hardening & Launch Prep

**What.** Security review, performance tuning, production cutover.

**How.**
- **Security pass:** confirm every user-owned table has both an API-level `userId` filter and a matching Supabase RLS policy. Confirm throttler limits are sane. Run `npm audit`/Dependabot. Confirm no secrets (Supabase service-role key, FX-rate provider keys, etc.) are reachable from any client path.
- **Index review:** `EXPLAIN ANALYZE` the slowest Phase 3–6 queries against a realistically-sized seeded dataset (not the small correctness fixtures); add composite indexes as needed — pay attention to the on-read cumulative equity/drawdown window queries.
- **Load/perf smoke test:** confirm analytics endpoints return in well under 3 s against a large seeded account (5,000+ trades), including the on-read equity computation.
- Sentry (error + performance tracing) and structured logging (`pino`).
- Production Supabase + Railway environments provisioned separately from staging; migration run against production as part of cutover.

**Testing.** Full Supertest + Jest suite green. Load-test results documented.

**Integration checkpoint.** Full regression with the frontend against the prod-mirrored environment (real RLS + real rate limits on).

**Definition of done.** v1.0 backend — secure, indexed, monitored, and verified under realistic data volume.

---

## Appendix — Full Prisma Schema Reference (cumulative, end state after Phase 9)

```prisma
model Profile {
  id              String   @id
  email           String   @unique
  displayName     String?
  timezone        String   @default("UTC")
  baseCurrency    String   @default("USD")   // ISO 4217
  startingBalance Decimal  @default(0)        // offsets the cumulative-P&L equity curve (GAP-08)
  createdAt       DateTime @default(now())
}

model Trade {
  id                String        @id @default(uuid())
  userId            String
  symbol            String
  assetClass        AssetClass                       // GAP-06
  entryPrice        Decimal
  exitPrice         Decimal?
  quantity          Decimal
  direction         TradeDirection
  stopLoss          Decimal?
  takeProfit        Decimal?
  currency          String                            // ISO 4217 (GAP-03)
  fxToBase          Decimal       @default(1)         // GAP-03
  openedAt          DateTime
  closedAt          DateTime?
  notes             String?
  netPnl            Decimal?                          // trade currency
  netPnlBase        Decimal?                          // base currency; analytics use this (GAP-03)
  plannedRiskReward Decimal?                          // GAP-05
  strategyId        String?                           // single FK (GAP-04, GAP-09)
  source            TradeSource
  externalId        String?
  createdAt         DateTime      @default(now())
  @@unique([userId, source, externalId])
  @@index([userId, openedAt])
  @@index([userId, strategyId])
}

model Strategy        { id String @id @default(uuid()) userId String name String }
model Tag             { id String @id @default(uuid()) userId String name String }   // no type enum (GAP-04)
model TradeTag        { tradeId String  tagId String  @@id([tradeId, tagId]) }

model Import          { id String @id @default(uuid()) userId String status ImportStatus rowErrors Json  mappingTemplateId String? createdAt DateTime @default(now()) }
model MappingTemplate { id String @id @default(uuid()) userId String name String columnMap Json }
model TradeScreenshot { id String @id @default(uuid()) tradeId String storagePath String label ScreenshotLabel createdAt DateTime @default(now()) }

// Daily rollup stores only per-day base-currency netPnl; equity & drawdown are computed on read (GAP-08 / GAP-02)
model DailySummary   { userId String  date DateTime  tradesCount Int  netPnl Decimal  @@id([userId, date]) }

model Rule            { id String @id @default(uuid()) userId String type RuleType config Json active Boolean @default(true) }
model RuleViolation   { id String @id @default(uuid()) userId String ruleId String tradeId String occurredOn DateTime detail String }

model Challenge         { id String @id @default(uuid()) name String definition Json isPredefined Boolean @default(true) }
model ChallengeProgress { id String @id @default(uuid()) userId String challengeId String status String progress Json }

model BrokerConnection { // schema only — retained for the future SnapTrade build (GAP-01, out of scope here)
  id                 String   @id @default(uuid())
  userId             String
  provider           String   // 'snaptrade'
  providerUserId     String
  providerUserSecret String   // to be encrypted at rest when SnapTrade is built (method TBD)
  authorizationId    String?
  accountLabel       String?
  status             String
  lastSyncedAt       DateTime?
}

enum TradeDirection { LONG SHORT }
enum TradeSource    { MANUAL IMPORT SNAPTRADE }
enum AssetClass     { EQUITY OPTION FUTURE FOREX CRYPTO }   // GAP-06
enum ImportStatus   { PENDING PROCESSING DONE FAILED }
enum ScreenshotLabel{ BEFORE AFTER }
enum RuleType       { MAX_TRADES_PER_DAY MAX_RISK_PERCENT NO_REVENGE_TRADING }
```

---

*See `frontend-plan.md` for the matching frontend track and how each endpoint above gets consumed.*
