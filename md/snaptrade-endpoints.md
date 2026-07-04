# SnapTrade Core Account Data API Fields

This file summarizes **what each key SnapTrade API endpoint returns**, focusing on the account + PnL + trade‑journal relevant endpoints you’ll actually consume.

Endpoints covered:
- `GET /accounts` (List accounts)
- `GET /accounts/{accountId}` (Account detail)
- `GET /accounts/{accountId}/holdings` (Balances, positions, recent orders)
- `GET /accounts/{accountId}/activities` (Transaction history = complete trade sheet)
- `GET /accounts/{accountId}/orders` (Recent orders per leg)

---

## `GET /accounts` – List accounts

Returns: **array of account objects** (each is a single brokerage account).[page:1]

**Account object fields** (also used by `GET /accounts/{accountId}`):

- `id` (string, uuid)
  - SnapTrade account ID. Stable while the connection exists.[page:1]

- `brokerage_authorization` (string, uuid)
  - Connection ID (brokerage_authorization_id). This links the account to a specific SnapTrade connection.[page:1]

- `name` (string | null)
  - Display name for the account (user‑defined or from the brokerage).[page:1]

- `number` (string)
  - Brokerage account number (may be masked).[page:1]

- `institution_account_id` (string | null)
  - Stable institution‑provided account identifier (can be used to detect same account across multiple connections).[page:1]

- `institution_name` (string)
  - Brokerage name (e.g. "Robinhood", "Schwab").[page:1]

- `created_date` (string, date‑time)
  - When SnapTrade created the account record (not brokerage opening date).[page:1]

- `funding_date` (string, date‑time | null)
  - When the account was first funded.[page:1]

- `opening_date` (string, date‑time | null)
  - Brokerage account opening date.[page:1]

- `sync_status` (object)
  - Status for transaction + holdings sync.[page:1]

  - `transactions` (object)
    - `initial_sync_completed` (boolean)
      - Whether initial transaction history sync is finished.[page:1]
    - `last_successful_sync` (string, date | null)
      - Date up to which transactions are fully synced.[page:1]
    - `first_transaction_date` (string, date | null)
      - Oldest transaction known to SnapTrade.[page:1]

  - `holdings` (object)
    - `initial_sync_completed` (boolean)
      - Whether initial holdings sync (positions, balances, orders) is finished.[page:1]
    - `last_successful_sync` (string, date‑time | null)
      - Last time holdings were successfully synced.[page:1]

- `balance` (object)
  - Account‑wide balance summary.[page:1]

  - `total` (object | null)
    - `amount` (number)
      - Total market value of the account (cash + securities).[page:1]
    - `currency` (string)
      - ISO‑4217 currency code for `amount`.[page:1]

- `status` (string | null)
  - Account status: `"open" | "closed" | "archived" | null`.[page:1]

- `raw_type` (string | null)
  - Account type string as returned by the brokerage (e.g. "Margin").[page:1]

- `account_category` (string | null)
  - Normalized category: `INVESTMENT`, `DEPOSIT`, `LOC` or null.[page:1]

- `meta` (object, deprecated)
  - Brokerage‑specific extra info (type, status, etc.).[page:1]

- `portfolio_group` (string, uuid | null, deprecated)
  - Legacy portfolio group ID.[page:1]

- `cash_restrictions` (array<string>, deprecated)
  - Legacy cash restriction flags.[page:1]

- `is_paper` (boolean)
  - Whether this is a paper/simulated trading account.[page:1]

---

## `GET /accounts/{accountId}` – Account detail

Returns: **one account object** with the same fields as `GET /accounts`, plus inline example data.[page:1]

Use cases for your journal:
- Resolve account identity + brokerage.
- Check sync completion for transactions/holdings.
- Read total account value and base currency.

---

## `GET /accounts/{accountId}/holdings` – Balances, positions, recent orders

Returns: **wrapper object** for a single account’s holdings.[page:4]

Top‑level fields:

- `account` (object)
  - Same shape as account object from `GET /accounts` / `GET /accounts/{accountId}`.[page:4]

- `balances` (array<object> | null)
  - Per‑currency balances.[page:4]

  - Each balance object:
    - `currency` (object)
      - `id` (uuid)
      - `code` (string, ISO‑4217)
      - `name` (string).[page:4]
    - `cash` (number | null)
      - Available cash in that currency (can be negative for margin).[page:4]
    - `buying_power` (number | null)
      - Margin buying power (if brokerage provides).[page:4]

- `positions` (array<object> | null)
  - Stock/ETF/crypto/mutual fund positions.[page:4]

  - Each position object:
    - `symbol` (object)
      - Position‑scoped symbol wrapper (legacy, usually ignore and use `symbol` child).[page:4]
    - `symbol` (object) – **Universal security descriptor**:[page:4]
      - `id` (uuid)
      - `symbol` (string, full ticker, e.g. "VAB.TO").[page:4]
      - `raw_symbol` (string, ticker without exchange suffix, e.g. "VAB").[page:4]
      - `description` (string | null, company/ETF name).[page:4]
      - `currency` (object)
        - `id`, `code`, `name` (listing currency).[page:4]
      - `exchange` (object)
        - `id` (uuid)
        - `code` (string, short exchange code).[page:4]
        - `mic_code` (string | null, MIC).
        - `name` (string, full exchange name).
        - `timezone` (string).
        - `start_time`, `close_time` (string, trading hours).
        - `suffix` (string | null, exchange suffix like ".TO").[page:4]
      - `type` (object)
        - `id` (uuid)
        - `code` (string, security type code like `cs`, `et`, `crypto`).[page:4]
        - `description` (string, e.g. "Common Stock", "ETF").[page:4]
      - `figi_code` (string | null)
      - `figi_instrument` (object | null)
        - `figi_code`, `figi_share_class`.[page:4]
      - `currencies` (array<object>, deprecated).[page:4]

    - `units` (number | null)
      - Quantity of shares; positive = long, negative = short.[page:4]

    - `price` (number | null)
      - Last known market price per share (real‑time or delayed depending on broker).[page:4]

    - `open_pnl` (number | null)
      - Unrealized P/L since position opened (current value minus total cost).[page:4]

    - `average_purchase_price` (number | null)
      - Cost basis per share.[page:4]

    - `currency` (object)
      - Position valuation currency (may differ from listing currency).[page:4]
      - `id`, `code`, `name`.[page:4]

    - `cash_equivalent` (boolean | null)
      - Whether counted as cash (money‑market etc.).[page:4]

    - `tax_lots` (array<object>) – optional, paid plans:[page:4]
      - `original_purchase_date` (date‑time | null)
      - `quantity` (string | null – shares in lot).
      - `purchased_price` (string | null – per‑share).
      - `cost_basis` (string | null – lot cost).
      - `current_value` (string | null – lot value).
      - `position_type` (string | null – e.g. `LONG`, `SHORT`).
      - `lot_id` (string | null).[page:4]

- `option_positions` (array<object> | null)
  - Option positions in the account.[page:4]

  - Each option position:
    - `symbol` (object)
      - Position‑scoped option symbol wrapper (legacy).[page:4]
    - `option_symbol` (object) – **universal option descriptor**:[page:4]
      - `id` (uuid)
      - `ticker` (string, OCC symbol).
      - `option_type` (string, `CALL` or `PUT`).
      - `strike_price` (number).
      - `expiration_date` (date).
      - `is_mini_option` (boolean).
      - `underlying_symbol` (object) – underlying security symbol.[page:4]
    - `price` (number | null)
      - Last price per *share* of the option contract.[page:4]
    - `units` (number)
      - Number of contracts; sign indicates long vs short.[page:4]
    - `average_purchase_price` (number | null)
      - Cost basis per contract.[page:4]
    - `currency` (object | null, deprecated) – price currency.[page:4]

- `orders` (array<object> | null)
  - Recent orders in the account (stock + option).[page:4]

  - Each order (same shape as `GET /accounts/{accountId}/orders`, see below) includes:
    - `brokerage_order_id`
    - `brokerage_group_order_id`
    - `order_role`
    - `status`
    - `universal_symbol` (for non‑option orders)
    - `option_symbol` (for option orders)
    - `quote_universal_symbol` / `quote_currency` (crypto pairs)
    - `action`
    - `total_quantity`, `open_quantity`, `canceled_quantity`, `filled_quantity`
    - `execution_price`, `limit_price`, `stop_price`
    - `order_type`, `time_in_force`
    - `time_placed`, `time_updated`, `time_executed`, `expiry_date`
    - `child_brokerage_order_ids` (take‑profit / stop‑loss IDs).[page:4]

---

## `GET /accounts/{accountId}/activities` – Transaction history (complete trade sheet)

Returns: **object** with `data` (array of UniversalActivity objects) + `pagination`.[page:2]

Top‑level:

- `data` (array<object>)
  - Each object is one transaction/activity.[page:2]

- `pagination` (object)
  - `offset` (integer)
  - `limit` (integer)
  - `total` (integer).[page:2]

**Activity object fields**:

- `id` (string)
  - SnapTrade transaction ID.[page:2]

- `symbol` (object | null)
  - Security for the transaction; null for cash‑only transactions (deposit, withdrawal, fee, etc.).[page:2]
  - Same universal symbol shape as in holdings/positions (`id`, `symbol`, `raw_symbol`, `description`, `currency`, `exchange`, `type`, `figi_*`).[page:2]

- `currency_universal_symbol` (object | null)
  - Quote security when `price`, `amount`, `fee` are denominated in a security rather than fiat (crypto trades).[page:2]

- `option_symbol` (object | null)
  - Option contract when the transaction involves options (CALL/PUT etc.).[page:2]

- `price` (number)
  - Per‑unit transaction price (shares or option contracts).[page:2]

- `units` (number)
  - Number of units in the transaction (shares/contracts).[page:2]

- `amount` (number | null)
  - Signed cash amount of the transaction in `currency`.[page:2]
    - Positive: cash into account (sell, dividend, deposit).
    - Negative: cash out (buy, fee, withdrawal).[page:2]

- `currency` (object | null)
  - Currency for `price`, `amount`, `fee` (null when denominated in `currency_universal_symbol`).[page:2]
  - `id`, `code`, `name`.[page:2]

- `type` (string)
  - Normalized transaction type:[page:2]
    - `BUY`, `SELL`
    - `DIVIDEND`, `STOCK_DIVIDEND`, `REI`
    - `CONTRIBUTION`, `WITHDRAWAL`
    - `INTEREST`
    - `FEE`, `TAX`
    - `OPTIONEXPIRATION`, `OPTIONASSIGNMENT`, `OPTIONEXERCISE`
    - `TRANSFER`, `EXTERNAL_ASSET_TRANSFER_IN`, `EXTERNAL_ASSET_TRANSFER_OUT`
    - `SPLIT`, `ADJUSTMENT`

- `option_type` (string)
  - Further specifies option BUY/SELL action: `BUY_TO_OPEN`, `BUY_TO_CLOSE`, `SELL_TO_OPEN`, `SELL_TO_CLOSE`.[page:2]

- `description` (string)
  - Brokerage description string for the transaction.[page:2]

- `trade_date` (string, date‑time | null)
  - Recorded timestamp for the transaction (granularity brokerage‑dependent).[page:2]

- `settlement_date` (string, date‑time)
  - Settlement timestamp.[page:2]

- `fee` (number)
  - Fee associated with the transaction (if provided).[page:2]

- `fx_rate` (number | null)
  - FX conversion rate if a currency conversion was involved.[page:2]

- `institution` (string)
  - Brokerage/institution name.[page:2]

- `external_reference_id` (string | null)
  - Broker reference ID to group related legs of an order (buy, fee, FX).[page:2]

This is the endpoint you’ll use as the **complete trade sheet** and to compute realized PnL per trade, per day, per strategy.[page:2]

---

## `GET /accounts/{accountId}/orders` – Recent orders

Returns: **array of order objects**, each representing a single order leg.[page:3]

**Order object fields**:

- `brokerage_order_id` (string)
  - Broker’s order ID (unique per leg).[page:3]

- `status` (string)
  - Normalized order status (SnapTrade enum):[page:3]
    - `NONE`, `PENDING`, `ACCEPTED`, `FAILED`, `REJECTED`, `CANCELED`, `PARTIAL_CANCELED`, `CANCEL_PENDING`, `EXECUTED`, `PARTIAL`, `REPLACE_PENDING`, `REPLACED`, `EXPIRED`, `QUEUED`, `TRIGGERED`, `ACTIVATED`.

- `universal_symbol` (object | null)
  - Security for stock/ETF/crypto/mutual fund orders (same universal symbol shape as above). Null for option orders.[page:3]

- `option_symbol` (object | null)
  - Option contract details for option orders (same shape as in holdings/option positions).[page:3]

- `quote_universal_symbol` (object | null)
  - Quote crypto symbol for crypto pair orders.[page:3]

- `quote_currency` (object | null)
  - Quote fiat currency for crypto pair orders.[page:3]

- `action` (string)
  - Intent/side of the order, e.g.:[page:3]
    - `BUY`, `SELL`
    - `BUY_COVER`, `SELL_SHORT`
    - `BUY_OPEN`, `BUY_CLOSE`, `SELL_OPEN`, `SELL_CLOSE`.

- `total_quantity` (number | null)
  - Total shares/contracts (sum of filled + canceled + open).[page:3]

- `open_quantity` (number | null)
  - Still open quantity.[page:3]

- `canceled_quantity` (number | null)
  - Canceled quantity.[page:3]

- `filled_quantity` (number | null)
  - Executed quantity.[page:3]

- `execution_price` (number | null)
  - Execution price (if filled).[page:3]

- `limit_price` (number | null)
  - Limit price for `Limit`/`StopLimit` orders.[page:3]

- `stop_price` (number | null)
  - Stop trigger price for `Stop`/`StopLimit` orders.[page:3]

- `order_type` (string | null)
  - Order type (mapped from brokerage): `Market`, `Limit`, `Stop`, `StopLimit`, or broker‑specific string.[page:3]

- `time_in_force` (string)
  - Time‑in‑force: `Day`, `GTC`, `FOK`, `IOC`, `GTD`, `MOO`, `EHP`, etc.[page:3]

- `time_placed` (string, date‑time)
  - When order was submitted.[page:3]

- `time_updated` (string, date‑time | null)
  - Last update time (if brokerage returns it).[page:3]

- `time_executed` (string, date‑time | null)
  - Execution time (if brokerage returns it).[page:3]

- `expiry_date` (string, date‑time | null)
  - Order expiry time (if brokerage returns it).[page:3]

- `symbol` (string, uuid, deprecated)
  - Legacy symbol ID (do not use).[page:3]

- `child_brokerage_order_ids` (object | null)
  - Bracket order child legs:[page:3]
    - `take_profit_order_id` (string)
    - `stop_loss_order_id` (string).

Use this endpoint to show pending orders, order lifecycle, and enrich trade entries with order metadata.[page:3]

---

## Mapping to your trade journal

For your NestJS + Prisma backend:

- Use `id`, `brokerage_authorization`, `institution_name`, `balance.total.amount`, `balance.total.currency`, `account_category`, `is_paper` from `GET /accounts` / `GET /accounts/{accountId}` for your account/connection tables.[page:1]
- Use `balances`, `positions`, `option_positions`, and inline `orders` from `GET /accounts/{accountId}/holdings` for current positions, unrealized PnL and open orders.[page:4]
- Use `data` from `GET /accounts/{accountId}/activities` (price, units, amount, fee, currency, fx_rate, type, trade_date, external_reference_id) as the canonical source of executed trades and cash flows.[page:2]
- Use `GET /accounts/{accountId}/orders` when you need more detailed order leg breakdown than the holdings wrapper provides.[page:3]

This file should drop straight into your repo as `snaptrade-endpoints.md` or similar.
