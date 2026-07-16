# Project History & Changelog

This document tracks all the architecture decisions, features, and phases completed in the `journal-backend` project since its inception.

---

## 🟢 Phase 0: Foundation & Scaffolding
**Status:** Completed

- **Framework Setup:** Initialized a new NestJS application configured with TypeScript (`moduleResolution: "node16"`).
- **Database Connection:** Integrated Prisma ORM and successfully connected to the Supabase PostgreSQL database.
- **Authentication:** 
  - Implemented `AuthModule` and `SupabaseAuthGuard`.
  - Configured JWT validation utilizing the `@supabase/supabase-js` client to seamlessly protect endpoints based on the Supabase user session.
- **User Profiles:** Created the `Profile` model in Prisma and `ProfilesModule` to sync/store user preferences (base currency, timezone, starting balance) upon first login.
- **Global App Configuration:** Set up Swagger for API documentation, global ValidationPipes, global exception filters, and security middleware (Helmet).

---

## 🟢 Phase 1: Trade Core & Metrics Engine
**Status:** Completed

- **Core Models:** Designed and migrated the Prisma schema for `Trade`, `Strategy`, `Tag`, and `TradeTag` (many-to-many).
- **Trade CRUD API:** Built the `TradesModule` with endpoints to create, read, update, and delete individual trades.
- **Metrics Engine:** 
  - Implemented `computeMetrics` inside the `TradesService` to automatically calculate financial metrics on every insert/update.
  - Automatically calculates: `netPnl`, `netPnlBase` (currency converted to user's base currency), `plannedRiskReward`, and `realizedRiskReward`.
- **Validation:** Integrated Zod schemas for strict DTO validation across all core trade endpoints.

---

## 🟢 Phase 2: Imports & Screenshot Attachments
**Status:** Completed

- **Bulk Import Engine:** 
  - Built the `ImportsModule` to handle file uploads (CSV, Excel).
  - Used `papaparse` and `xlsx` for parsing rows.
  - Implemented a smart deduplication system: generating a SHA-256 hash (`externalId`) based on `(symbol, openedAt, quantity, entryPrice)` to prevent duplicate trades across multiple file uploads.
- **Mapping Templates:** 
  - Created the `MappingTemplate` model so users can map custom CSV headers from their specific brokerages to our standard Trade fields, and save those templates for future use.
- **Screenshot Attachments:**
  - Designed the `TradeScreenshot` model and `ScreenshotsService`.
  - Integrated directly with Supabase Storage.
  - Implemented logic to issue **pre-signed URLs** to the frontend, allowing secure, direct-to-storage image uploads that bypass the backend completely, keeping the server lightweight.

---

## 🟢 Phase 2.5: SnapTrade Schema Foundation
**Status:** Completed

- **SnapTrade Integration Prep:**
  - Evaluated the SnapTrade API endpoints for Accounts, Activities, Holdings, and Orders.
  - Upgraded the Prisma schema to support a "raw data staging ground" for brokerage sync.
- **New Brokerage Models:**
  - `BrokerageConnection`: Manages the SnapTrade OAuth authorization link.
  - `BrokerageAccount`: Stores the individual brokerage accounts, balances, and sync statuses.
  - `BrokerageActivity`: The raw ledger of transactions (BUYS, SELLS, FEES, DIVIDENDS) direct from the broker.
  - `BrokeragePosition`: Current real-time holdings and unrealized PnL.
  - `BrokerageOrder`: Pending and executed orders.
- **Trade Linking:** Added `accountId` to the `Trade` model so when raw activities are eventually rolled up into a complete Trade, they maintain a link to their originating brokerage account.

---

## 🟢 Phase 3: Analytics & Dashboard
**Status:** Completed
extra Implementation Detail: """"
- **Global Date-Range Filter & Timezone Architecture:** 
  - Implemented `RangeResolverService` (`src/modules/analytics/range-resolver.service.ts`) using the `date-fns-tz` library to perform highly accurate date bucketing (`today`, `this_week`, `this_month`, `all_time`, etc.).
  - **WHY we implemented it in the backend:** If a server blindly uses UTC to define "today," a trader in India (Asia/Kolkata, +05:30) taking a trade at 2:00 AM local time would have their trade assigned to "yesterday" in UTC. This completely corrupts their daily P&L summary and equity curve. By making the backend fully timezone-aware, we ensure that a daily bucket explicitly rolls over exactly at midnight for the user's *local* time, no matter where the server is hosted.
  - **WHERE it is implemented in the backend:** The `AnalyticsController` fetches the user's `timezone` string from their `Profile` record in the database. It passes this string (e.g., `'Asia/Kolkata'`) to the `RangeResolverService`, which computes the exact absolute UTC bounds (e.g., `18:30:00 UTC` to `18:29:59 UTC`) representing that local day, and then queries the database safely.
  - **HOW it affects the frontend:** The frontend is completely relieved of doing complex Date Math or fighting with Javascript's notorious `Date` object issues. The frontend does not need to send `from` and `to` timestamps to view the dashboard.
  - **WHERE to implement this in the frontend:**
    1. **Settings / Onboarding Page:** You MUST build a dropdown where the user selects their timezone (e.g. `Asia/Kolkata`, `America/New_York`) and `PUT`s it to their `Profile` record. Without this, the backend defaults to UTC.
    2. **Dashboard / Analytics UI:** The Date Filter dropdown simply needs to pass the string token to the backend: `GET /analytics/equity?range=this_week`. 
    3. **Trade Entry Form:** When the user enters a trade, the frontend should still just send standard ISO strings (`openedAt`, `closedAt`) in UTC. The backend handles the rest.
"""


- **Pre-Aggregated Daily Summaries:** 
  - Created the `DailySummary` model.
  - **Extra Implementation Detail:** Rather than querying and summing raw `Trade` records every time the dashboard loads (which would get very slow), we implemented an interception hook in the `TradesService`. Whenever a trade is created, updated, or deleted, it triggers `recomputeDailySummary()` to instantly upsert the `tradesCount` and `netPnl` for that specific day. If a trade is moved to a new date, it automatically recalculates both the old and new dates.
  - **Frontend Integration:** Nothing changes for the Trade CRUD operations! Just seamlessly query `GET /analytics/summary` to get the dashboard tiles (`totalNetPnl`, `winCount`, etc.) knowing that it is optimized under the hood.
- **Equity Curves & Drawdown:** 
  - Exposed `GET /analytics/equity` and `GET /analytics/drawdown`.
  - **Extra Implementation Detail:** Used raw SQL `$queryRaw` window functions (`SUM(netPnl) OVER (ORDER BY date)`) against the `DailySummary` table to dynamically compute running equity curves. Drawdown computes the running peak and subtracts current equity entirely within the Postgres database.
  - **Frontend Integration:** Pass the response arrays directly into the charting library (like Recharts or Chart.js). The `equity` curve is automatically offset by the user's `startingBalance` located in their Profile, so the graph will correctly start at their initial deposit amount rather than 0.
- **Automated Regression Testing:** 
  - Added robust Jest and Supertest suites.
  - **Extra Implementation Detail:** Specifically built the "GAP-02 Regression Test" which simulates inserting a trade, observing the equity rise, and then inserting an older *backdated* trade to programmatically prove that the historical injection correctly bubbles up and adjusts the equity of all subsequent days in the timeline.

---

## 🟡 Next Up: Phase 4 (Analytics Dashboard Visuals / Strategy Analysis)
**Status:** Pending

- **TBD:** Begin tracking the next layer of metrics (e.g. strategy performance, tag performance).
