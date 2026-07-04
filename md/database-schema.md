# Database Schema

1. Profile
   - id
   - email
   - displayName
   - timezone
   - baseCurrency
   - startingBalance
   - createdAt

2. Strategy
   - id
   - userId
   - name
   - createdAt

3. Tag
   - id
   - userId
   - name
   - createdAt

4. Trade
   - id
   - userId
   - symbol
   - assetClass
   - entryPrice
   - exitPrice
   - quantity
   - direction
   - stopLoss
   - takeProfit
   - currency
   - fxToBase
   - openedAt
   - closedAt
   - notes
   - netPnl
   - netPnlBase
   - plannedRiskReward
   - strategyId
   - source
   - externalId
   - accountId
   - createdAt

5. TradeTag
   - tradeId
   - tagId

6. Import
   - id
   - userId
   - status
   - fileName
   - totalRows
   - successCount
   - errorCount
   - skippedCount
   - rowErrors
   - notices
   - mappingTemplateId
   - createdAt

7. MappingTemplate
   - id
   - userId
   - name
   - columnMap
   - createdAt

8. TradeScreenshot
   - id
   - tradeId
   - storagePath
   - label
   - createdAt

9. BrokerageConnection
   - id
   - userId
   - institutionName
   - status
   - createdAt
   - updatedAt

10. BrokerageAccount
    - id
    - userId
    - connectionId
    - name
    - number
    - institutionName
    - balance
    - currency
    - status
    - category
    - isPaper
    - syncStatus
    - createdAt
    - updatedAt

11. BrokerageActivity
    - id
    - userId
    - accountId
    - symbol
    - assetClass
    - type
    - optionType
    - price
    - units
    - amount
    - fee
    - currency
    - fxRate
    - description
    - tradeDate
    - settlementDate
    - externalReferenceId
    - isProcessed
    - createdAt

12. BrokeragePosition
    - id
    - userId
    - accountId
    - symbol
    - assetClass
    - units
    - averagePrice
    - currentPrice
    - openPnl
    - currency
    - createdAt
    - updatedAt

13. BrokerageOrder
    - id
    - userId
    - accountId
    - symbol
    - assetClass
    - action
    - status
    - totalQuantity
    - openQuantity
    - filledQuantity
    - executionPrice
    - limitPrice
    - stopPrice
    - orderType
    - timeInForce
    - timePlaced
    - timeExecuted
    - timeUpdated
    - createdAt
    - updatedAt


---

# Table Purposes & Data Flow

### 1. Profile
- **Purpose:** Stores the core user profile settings and preferences.
- **What data it holds:** Timezone, base currency preference, and starting balance for their equity curve.
- **Who inserts it:** The backend automatically creates this record the very first time a user successfully authenticates via Supabase (auth triggers or first API call).

### 2. Strategy
- **Purpose:** Groups related trades together under a named trading system.
- **What data it holds:** Just the name of the strategy (e.g., "Breakout", "Mean Reversion").
- **Who inserts it:** The User creates strategies manually through the dashboard.

### 3. Tag
- **Purpose:** Allows granular, flexible categorization of trades.
- **What data it holds:** Tag names (e.g., "FOMO", "Earnings Play").
- **Who inserts it:** The User creates tags manually via the dashboard or assigns them during a trade import.

### 4. Trade
- **Purpose:** The core entity of the journal. It represents a rolled-up, completed (or open) trading position.
- **What data it holds:** Entry/exit prices, asset class, direction, timestamps, profitability (PnL), and risk metrics. 
- **Who inserts it:** 
  1. The User (via manual entry in the dashboard).
  2. The CSV Import Engine (parsing and inserting rows from broker files).
  3. The SnapTrade Sync Engine (future: automatically rolling up raw brokerage activities into full trades).

### 5. TradeTag
- **Purpose:** A pivot table (many-to-many relationship) to link a Trade to multiple Tags.
- **What data it holds:** Just the foreign keys linking a `tradeId` to a `tagId`.
- **Who inserts it:** The backend automatically inserts these when a user links tags to a trade.

### 6. Import
- **Purpose:** Tracks the progress and results of CSV/Excel bulk trade uploads.
- **What data it holds:** Status of the upload, success/error counts, row-specific error logs, and the file name.
- **Who inserts it:** The backend creates this record when a user uploads a CSV file, and updates it as the background parsing engine processes the rows.

### 7. MappingTemplate
- **Purpose:** Saves column mappings from a broker's CSV export so the user doesn't have to remap columns every time they upload a file.
- **What data it holds:** A JSON object mapping CSV column headers (e.g., "Exec Price") to our Trade fields (e.g., "entryPrice").
- **Who inserts it:** The User saves a mapping configuration via the dashboard.

### 8. TradeScreenshot
- **Purpose:** Stores visual evidence/charts for a trade.
- **What data it holds:** The storage path pointing to the image in the Supabase Storage bucket, and a label ("BEFORE" or "AFTER" the trade).
- **Who inserts it:** The User uploads the image to Supabase, and the backend saves the path reference to this table.

### 9. BrokerageConnection
- **Purpose:** Represents an active link to a specific Brokerage institution via SnapTrade.
- **What data it holds:** The institution name and the connection status.
- **Who inserts it:** The backend creates this when the user completes the SnapTrade OAuth authorization flow.

### 10. BrokerageAccount
- **Purpose:** Represents a specific account (e.g., Margin, Cash, IRA) inside a connected brokerage.
- **What data it holds:** Account numbers, balances, currency, and sync status for fetching history.
- **Who inserts it:** The SnapTrade Sync Engine (Webhook or background cron job) automatically pulls and inserts these from SnapTrade.

### 11. BrokerageActivity
- **Purpose:** The raw, immutable ledger of every transaction that happens in a brokerage account.
- **What data it holds:** Every raw BUY, SELL, DIVIDEND, or FEE action, exactly as the broker reports it.
- **Who inserts it:** The SnapTrade Sync Engine automatically fetches these daily. The background engine will later read these rows to calculate and generate a `Trade`.

### 12. BrokeragePosition
- **Purpose:** Tracks the live, currently open holdings in a brokerage account.
- **What data it holds:** The current live units held, average price, and floating open PnL.
- **Who inserts it:** The SnapTrade Sync Engine continuously updates these from real-time broker feeds.

### 13. BrokerageOrder
- **Purpose:** Tracks the intent and execution of trades at the broker level.
- **What data it holds:** Limit prices, order statuses (Pending, Executed, Canceled), and quantities.
- **Who inserts it:** The SnapTrade Sync Engine pulls these in to show the user their pending live orders in the dashboard.
