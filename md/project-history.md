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

## 🟡 Next Up: Phase 3 (Analytics & Dashboard)
**Status:** Pending

- **Global Date-Range Filter:** Implementing `RangeResolverService` to handle timezone-aware date bucketing (`today`, `this_week`, `this_month`, etc).
- **Daily Summaries:** Creating aggregated PnL stats.
- **Equity Curves & Drawdown:** SQL window functions to dynamically compute running equity curves based on cumulative realized P&L offset by the user's starting balance.
