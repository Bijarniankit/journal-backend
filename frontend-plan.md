# Frontend Plan — Next.js (apps/web)

Companion to `backend-plan.md`. Same 10 phases, same phase numbers, same shared contract in `packages/shared` — build in this order, and don't start a phase's UI until that phase's contract (Zod schema + endpoint list) is agreed with the backend dev.

> **Revision note.** This version tracks the reviewed gap decisions: multi-currency display (GAP-03), first-class strategies + one strategy per trade (GAP-04/09), planned Risk/Reward with sample size shown (GAP-05), asset-class field / single-leg scope (GAP-06), equity shown as cumulative P&L (GAP-08), pinned `summary` vs `performance` consumption (GAP-11, plus range-aware heatmaps, GAP-10), and Supabase Auth with Bearer tokens (GAP-12). **The chart library is now Apache ECharts (`echarts-for-react`)** — see below. **Trade replay is out of scope.** **SnapTrade (GAP-01) is future backlog** — no connect/sync UI in these 10 phases.

---

## 0. Conventions & Base Setup (read once, applies to every phase)

**Stack:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, TanStack Query, TanStack Table, React Hook Form + Zod, **Apache ECharts via `echarts-for-react`** for charts, Supabase JS client (auth session + storage upload only — all data reads/writes go through the NestJS API, never direct-to-table, so business logic stays in one place).

**Why ECharts (decided — replaces Recharts/Tremor):** it is **canvas-rendered** (performance headroom) and, decisively for this product, ships **native `calendar` (calendar-heatmap) and `heatmap` series** — exactly the Phase 5 green/red calendar and the three Phase 6 heatmaps — which Recharts cannot render cleanly. It also covers the line/area charts for equity and drawdown. Import only the series you use (tree-shakeable). All charts are **client components** (`'use client'`) — ECharts touches the DOM/canvas, so keep chart components out of Server Components.

**Auth (decided — GAP-12):** authentication is **Supabase Auth**. The Supabase JS client owns the session; `lib/api-client.ts` attaches the session **access token as a `Bearer` header** on every API call. No cookie-based transport. Locked in Phase 0.

**Folder structure (`apps/web/src`):**
```
app/                        -- Next.js routes (App Router)
  (auth)/login, /signup, /reset-password
  (app)/dashboard, /trades, /import, /analytics, /calendar, /rules, /challenges
components/
  ui/                        -- shadcn primitives
  charts/                    -- ECharts wrappers (client components): LineChart, AreaChart, CalendarHeatmap, Heatmap
  trades/, analytics/, calendar/, rules/, challenges/   -- feature-grouped
hooks/
  queries/                   -- TanStack Query hooks, one file per resource
  mutations/
lib/
  api-client.ts              -- typed fetch wrapper, reads from packages/shared, attaches Bearer token
  supabase.ts                -- Supabase client (auth + storage only)
```

**API consumption pattern (use every phase):**
- One `lib/api-client.ts` wrapper: typed methods (`api.trades.list(params)`, `api.analytics.performance(range)`) built from the Zod schemas in `packages/shared`, so a backend contract change is a compile error, not a runtime surprise.
- One TanStack Query hook per resource per operation (`useTrades(filters)`, `useCreateTrade()`, `useSummary(range)`). Query keys always include the active filters/range so caching is automatic per view.
- Forms use `react-hook-form` + `zodResolver(SharedSchema)` — the same schema the backend validates against.

**Money & currency (GAP-03):** the backend returns monetary values already converted to the user's `baseCurrency` (via `netPnlBase`). The frontend **formats and labels amounts in the base currency** and never sums cross-currency values itself. On the trade form, `currency` defaults to the profile's base currency.

**Testing baseline:** component tests (React Testing Library) for forms/tables; Playwright E2E specs at the end of each phase for that phase's critical flow.

**Deferred / out of scope:** SnapTrade connect/sync UI (GAP-01), multi-leg option spread entry (GAP-06 — single-leg only), trade replay.

---

## Phase 0 — Foundations

**What.** App shell + auth screens + a protected dashboard stub.

**How.**
- `app/(auth)/login`, `/signup`, `/reset-password` — forms call `supabase.auth.signInWithPassword` / `signUp` / `resetPasswordForEmail` via the Supabase client (auth only).
- Root layout with nav (shadcn sidebar/nav); an `(app)` route group wrapped in a server-side auth check (redirect to `/login` if no session).
- `lib/api-client.ts` scaffolded: a base `fetch` wrapper that reads the Supabase session and attaches the **access token as a Bearer header** (GAP-12 — no cookie fallback).
- `useMe()` query hook calling `GET /me` to confirm the round-trip (and to read `timezone`, `baseCurrency`, `startingBalance` for later phases).
- CI: GitHub Actions running `pnpm lint && pnpm typecheck && pnpm build`; Vercel preview deploys on PR.

**Integration checkpoint.** Sign up → dashboard stub. Refresh → session persists. `useMe()` shows the real profile from the real API (no mock in the Network tab).

**Definition of done.** Auth screens work against the deployed API; protected routes actually protect; CI green.

---

## Phase 1 — Trade Journal Core

**What.** Trade entry form, trades list, trade detail, strategy/tag management.

**How.**
- `TradeForm` component: all fields from the shared `TradeSchema` — `symbol`, `assetClass` (GAP-06), `entryPrice`, `exitPrice`, `quantity`, `direction`, `stopLoss`, `takeProfit`, `currency` (default = base), `openedAt`, `closedAt`, `notes`, `strategyId`, `tagIds`. `react-hook-form` + `zodResolver`. Direction as a segmented control (Long/Short); `assetClass` as a select; `currency` defaults to the profile base currency and is rarely changed.
- `useCreateTrade()` / `useUpdateTrade()` mutations with optimistic updates on the trades list (roll back on error).
- `TradesTable` using TanStack Table + `useTrades({ page, sort, filters })` — server-side pagination and sorting; filters include `assetClass`, `strategyId`, `tagId`, `direction`.
- `TradeDetail`: read-only view + edit-in-place, showing the **server-computed** `netPnl`, `netPnlBase`, and `plannedRiskReward` (never compute these client-side — the backend is source of truth; the frontend only formats/labels, base amounts in base currency).
- Strategy/tag management: a lightweight combobox with inline "create new" (shadcn `Command`), backed by `useStrategies()` / `useTags()`. **One strategy per trade** (single `strategyId`, GAP-09); tags are multi-select behavioural/mistake labels (GAP-04).

**Testing.** Component test on `TradeForm` validation (bad quantity, missing required field). Playwright: create → appears in list with correct P&L → edit → delete.

**Integration checkpoint.** Create a trade end-to-end (including one non-base-currency trade), confirm the displayed `netPnl`/`netPnlBase`/R:R match the backend's fixture exactly.

**Definition of done.** Full manual trade CRUD works against the real API with correct computed, currency-converted values displayed.

---

## Phase 2 — CSV/Excel Import & Screenshots

**What.** File upload with column mapping, import progress/errors, screenshot attach.

**How.**
- Upload widget parses the file client-side first (`papaparse` for CSV, `xlsx`/SheetJS for Excel) purely for **preview** — the server does the authoritative parse. Show a preview table before commit.
- Column-mapping UI: a two-column mapper (file column → our field), pre-filled by a best-guess header match; the mappable fields now include `currency` and `assetClass` (GAP-03/06). "Save as template" calls `useSaveMappingTemplate()`.
- Submit calls `POST /imports` with the file + confirmed mapping; poll `GET /imports/:id` (TanStack Query `refetchInterval` while `processing`) to show progress and row-level errors (row number, reason), including any "defaulted currency/asset class" notices from the server.
- Screenshots: on `TradeDetail`, an upload button requests a presigned URL, uploads directly to Supabase Storage, then confirms the attachment via the API — the file never passes through NestJS.

**Testing.** Playwright: upload a real sample CSV → correct trades appear → re-upload → no duplicates. Attach a screenshot → visible on reload.

**Integration checkpoint.** Import a shared test CSV (agreed with the backend dev); both confirm identical resulting trades and zero duplicates on re-import.

**Definition of done.** Import + screenshot flows work end-to-end with clear error feedback on bad rows.

---

## Phase 3 — Portfolio Dashboard & Global Date-Range Filter

**What.** The reusable date-range picker (built once, used everywhere after), dashboard tiles, equity/drawdown charts.

**How.**
- `DateRangePicker` component: presets (Today, This week, This month, This year, Past 1 year, All time) + a custom calendar range (shadcn `Calendar` in range mode). Store the selected range in **URL search params** (recommended — shareable/bookmarkable and survives refresh for free).
- **Critical pattern:** every analytics query hook takes `range` as part of its TanStack Query key, e.g. `useSummary(range)` → key `['analytics','summary', range]`. Range switching is instant on revisit (cached) while staying correct.
- Dashboard tiles: stat cards reading `useSummary(range)`, which returns the pinned fields (GAP-11) `{ totalNetPnl, tradeCount, winCount, lossCount, byPeriod }` — all already in base currency; the frontend just formats.
- Equity curve + drawdown: ECharts **line/area** charts fed by `useEquity(range)` / `useDrawdown(range)`. The series are the server's on-read cumulative values; **label the equity axis as cumulative P&L (offset by starting balance), not "account balance"** (GAP-08).
- Use `placeholderData: keepPreviousData` when the range changes so charts don't flash empty while refetching.

**Testing.** Playwright: switch every preset, confirm tile numbers change and match the backend's seeded fixture values exactly; include a back-dated-trade scenario to confirm the equity curve updates for later dates too.

**Integration checkpoint.** Walk through all presets + one custom range together; numbers must match hand-calculated expected values.

**Definition of done.** Date-range picker is reusable (exported as a shared component); dashboard is fully range-aware and accurate; equity labelled correctly.

---

## Phase 4 — Analytics Dashboard

**What.** Win rate, profit factor, expectancy, avg win/loss, planned R:R, largest win/loss, streaks.

**How.**
- Reuse the Phase 3 `DateRangePicker`. New `useAnalytics(range)` hook hitting `GET /analytics/performance`.
- Metric tiles grouped visually (Win rate / Profit factor / Expectancy together; Largest win / Largest loss together), matching how the metrics group conceptually.
- **Planned R:R tile (GAP-05):** show `avgPlannedRiskReward` with its `tradesWithPlannedRR` count as a subtitle (e.g. "1.8 R:R · based on 42 of 120 trades"), so the partial sample is transparent rather than misleading.
- Loading state: skeleton tiles, not a spinner, so the layout doesn't jump.

**Testing.** Playwright: load against the shared fixture account, assert every tile against hand-calculated expected numbers (get these from the backend dev's fixtures — don't calculate independently, or a shared bug hides).

**Integration checkpoint.** Every metric tile matches the backend's fixture-verified numbers exactly, including the R:R sample count.

**Definition of done.** All performance metrics correct, range-aware, with R:R sample size shown.

---

## Phase 5 — Calendar, Strategy & Tag Analytics

**What.** Calendar view, strategy breakdown table, tag-based loss analysis.

**How.**
- Calendar: an ECharts **`calendar` + `heatmap`** view coloring each day green/red by that day's P&L sign, with the day's total in the tooltip and a month summary in the header. Backed by `useCalendar(month)`. (ECharts' native calendar coordinate system is the reason for the library choice — no custom month-grid needed.)
- Strategy/Tag breakdown: reuse one `BreakdownTable` component parameterized by `dimension` (`strategy` | `tag`), calling `useByDimension(dimension, range)` — the backend exposes one generic endpoint, so keep the frontend generic too.
- Tag view highlights (e.g. red-tinted row) tags with negative aggregate P&L, directly answering "which tags make me lose money."

**Testing.** Playwright: calendar colors match a seeded month; strategy/tag tables match expected aggregates.

**Integration checkpoint.** Confirm calendar day coloring and breakdown numbers against the backend's seeded month.

**Definition of done.** Calendar and both breakdown views accurate end-to-end.

---

## Phase 6 — Session, Day/Time Analytics & Heatmaps

**What.** Session/day/hour breakdowns, three heatmaps.

**How.**
- Reuse `BreakdownTable` from Phase 5 with `dimension=session|dayOfWeek|hour`.
- "Best/worst day" and "best hour" callouts: derive max/min directly from the `by-dimension` response — no separate endpoint call.
- Heatmap: one generic ECharts **`heatmap`** component reused for all three (day, session, strategy), fed by `useHeatmap(type, range)` — the endpoint is now range-aware (GAP-10). Color-scale diverging red→gray→green by P&L intensity.
- All timestamps displayed in the user's timezone (`profile.timezone` from Phase 0) — never assume browser timezone equals the stored preference.

**Testing.** Playwright: heatmap cell values match seeded expected data; spot-check with a non-UTC test profile timezone.

**Integration checkpoint.** Confirm timezone-sensitive numbers (best hour, session buckets) match between frontend display and backend calculation for a non-UTC test user.

**Definition of done.** Session/day/hour views and all three heatmaps accurate, timezone-correct, and range-aware.

---

## Phase 7 — Trading Plan Tracker

**What.** Rule builder, violation flags, adherence overview.

**How.**
- Rule creation form: a small set of rule "types" (max trades/day, risk % per trade, no-revenge-trading window) each with its own config fields — modelled as a discriminated union in the shared schema so the form switches fields by selected rule type.
- Violations: a badge/flag on `TradesTable` rows and calendar days that have a violation (`useViolations(range)`), plus a dedicated "Plan Adherence" summary (violation count over time, by rule).

**Testing.** Playwright: create a "max 2 trades/day" rule, log a 3rd trade same day, confirm the flag appears on that trade and that day.

**Integration checkpoint.** Confirm violation flags appear/disappear correctly as rules are created, edited, and deactivated.

**Definition of done.** Rule management and violation display work end-to-end.

---

## Phase 8 — Goals & Challenges

**What.** Browse/join challenges, track progress.

**How.**
- Challenge list (predefined ones from the backend) with a "join" action; joined challenges show a progress bar/checklist (`useChallengeProgress()`), gamified styling (progress ring, streak counter) consistent with the shadcn design tokens already in use.

**Testing.** Playwright: join a challenge, log qualifying/disqualifying trades, confirm progress updates.

**Integration checkpoint.** Progress updates correctly and matches backend-computed state after each qualifying/disqualifying trade.

**Definition of done.** Challenge join/progress flow works end-to-end.

---

## Phase 9 — Hardening & Launch Prep

**What.** Production polish.

**How.**
- Pass over every view for loading/empty/error states (many were stubbed happy-path-only through Phases 1–8).
- First-time-user onboarding: empty trade journal shows a clear "log your first trade" call to action rather than a blank table.
- Route-level code splitting review (`next/dynamic` for the ECharts-heavy views so the chart bundle isn't in the initial payload); image optimization for screenshots.
- Sentry wired for the frontend (source maps uploaded in CI).
- Placeholder Terms/Privacy pages linked from footer/signup.

**Testing.** Full Playwright regression suite (all specs from Phases 0–8) against the production-mirrored staging environment.

**Integration checkpoint.** Full regression suite green; manual walk-through of every phase's checkpoint on the prod-mirrored environment with the backend dev.

**Definition of done.** v1.0 frontend — every view production-ready with proper states, monitored, and passing the full regression suite.

---

*See `backend-plan.md` for the matching backend track and the full API/DB contract each phase above depends on.*
