# Cost Basis and Average Entry Price Tracking

## Overview

This feature computes average entry price in USD for all fund positions by extracting paired USDT/USDC legs from transactions. It enables proper P&L tracking and performance monitoring for crypto assets.

## Trading Rule Enshrined

**All crypto trades MUST be against USDT or USDC pairs for proper accounting.**

This is not just a best practice—it's now enforced in the codebase. The cost basis calculation algorithm specifically looks for USDT/USDC legs to determine the USD cost of each position.

## How It Works

### Transaction Structure

When you execute a crypto trade (e.g., buying 100 BONK with 10 USDT):

```rust
Transaction {
  legs: [
    // Leg 1: USDT given (Credit = you gave it away)
    Leg {
      account_id: "acct.binance",
      direction: Credit,
      amount: Crypto { asset: "USDT", qty: 10.0 }
    },

    // Leg 2: BONK received (Debit = you received it)
    Leg {
      account_id: "acct.binance",
      direction: Debit,
      amount: Crypto { asset: "BONK", qty: 100.0 },
      category_id: "fund.altcoins"  // Links to fund
    }
  ]
}
```

### Cost Basis Calculation Algorithm

The `get_positions_for_fund` function:

1. **Finds all transactions** where any leg has `category_id` matching the fund
2. **For each transaction**, identifies:
   - The fund leg (has matching `category_id`)
   - The paired stablecoin leg (USDT or USDC)
3. **Extracts quantities**:
   - Asset qty with direction (Debit = +, Credit = -)
   - USD cost with direction (Credit = spent, Debit = received)
4. **Aggregates by asset**:
   - Sums total qty for each asset
   - Sums total USD cost basis
5. **Computes average entry price**: `cost_basis_usd / qty`

### Example Calculation

```
Transaction 1: Buy 100 BONK for 10 USDT
  → qty: +100, cost: +$10

Transaction 2: Buy 200 BONK for 30 USDT
  → qty: +200, cost: +$30

Transaction 3: Sell 50 BONK for 20 USDT
  → qty: -50, cost: -$20

Final Position:
  Total qty: 250 BONK
  Total cost basis: $20
  Average entry price: $20 / 250 = $0.08 per BONK
```

## Backend Implementation

### Enhanced Position Struct

```rust
pub struct Position {
    pub fund_id: String,
    pub asset: String,
    pub qty: Decimal,
    pub price_in_base_ccy: Decimal,    // Current market price
    pub cost_basis_usd: Decimal,       // NEW: Total USD paid
    pub avg_entry_price_usd: Decimal,  // NEW: Avg entry price
    pub last_updated: i64,
}
```

### API Endpoints

Both endpoints return the enhanced Position structure with cost basis:

- `GET /capital/funds/positions` - All funds' positions
- `GET /capital/funds/:fund_id/positions` - Specific fund's positions

## Frontend Implementation

### TypeScript Interface

```typescript
interface Position {
  fund_id: string;
  asset: string;
  qty: number | string;
  price_in_base_ccy: number | string;
  cost_basis_usd: number | string;
  avg_entry_price_usd: number | string;
  last_updated: number;
}
```

### Display on Funds Page

The funds page now shows a comprehensive position table:

| Asset | Qty    | Avg Entry | Price     | Value     | Unrealized P&L      | Updated |
| ----- | ------ | --------- | --------- | --------- | ------------------- | ------- |
| BONK  | 250.00 | $0.08     | $0.12     | $30.00    | +$10.00 (+50.0%)    | Jan 15  |
| ETH   | 2.50   | $2,400.00 | $2,800.00 | $7,000.00 | +$1,000.00 (+16.7%) | Jan 14  |

**Unrealized P&L Calculation:**

```typescript
const unrealizedPnL = qty * (currentPrice - avgEntryPrice);
const pnlPercent = ((currentPrice - avgEntryPrice) / avgEntryPrice) * 100;
```

**Color Coding:**

- Green: Positive P&L (gains)
- Red: Negative P&L (losses)

## Key Features

### 1. Automatic Cost Basis Tracking

- No manual input required
- Computed on-demand from transaction history
- Handles multiple buys at different prices

### 2. Partial Sell Support

- Selling part of a position correctly adjusts quantities and cost basis
- Average entry price remains constant for remaining units

### 3. Multi-Asset Support

- Works for any crypto asset traded against USDT/USDC
- Supports BTC, ETH, SOL, BONK, DOGE, etc.

### 4. Real-time P&L

- Uses current market prices from data feeds
- Calculates unrealized gains/losses instantly
- Shows both dollar amount and percentage

## Assumptions & Limitations

### Assumptions

1. **USDT ≈ USD**: We treat 1 USDT = 1 USD for cost basis
2. **All trades paired**: Every crypto trade has a corresponding USDT/USDC leg
3. **Fund categorization**: Assets belong to funds via `category_id` on legs

### Limitations

1. **No fee tracking**: Trading fees are not yet included in cost basis
2. **No FIFO/LIFO**: Uses weighted average method (not specific lot tracking)
3. **Single currency**: Cost basis only in USD (not HKD or BTC)
4. **No tax lots**: Cannot distinguish between short-term and long-term holdings

## Future Enhancements

### Planned

- [ ] Include trading fees in cost basis calculation
- [ ] Support realized P&L tracking (closed positions)
- [ ] Add tax lot tracking (FIFO, LIFO, specific identification)
- [ ] Historical cost basis analysis (performance over time)
- [ ] Multi-currency cost basis (HKD, BTC)

### Considerations

- [ ] Handling airdrops (zero cost basis)
- [ ] Staking rewards cost basis
- [ ] Cross-chain bridges and wrapped assets
- [ ] Wash sale detection for tax purposes

## Testing

### Manual Testing Steps

1. **Create a buy transaction**:

   ```bash
   # Buy 100 BONK for 10 USDT
   POST /capital/transactions
   {
     "legs": [
       {"account_id": "acct.binance", "direction": "Credit",
        "amount": {"kind": "Crypto", "data": {"asset": "USDT", "qty": "10"}}},
       {"account_id": "acct.binance", "direction": "Debit",
        "amount": {"kind": "Crypto", "data": {"asset": "BONK", "qty": "100"}},
        "category_id": "fund.altcoins"}
     ]
   }
   ```

2. **Fetch positions**:

   ```bash
   GET /capital/funds/fund.altcoins/positions
   ```

3. **Verify output**:

   ```json
   [
     {
       "fund_id": "fund.altcoins",
       "asset": "BONK",
       "qty": "100",
       "cost_basis_usd": "10",
       "avg_entry_price_usd": "0.10",
       "price_in_base_ccy": "0",
       "last_updated": 1736985600
     }
   ]
   ```

4. **Check frontend display**:
   - Navigate to `/capital/funds`
   - Verify BONK position shows:
     - Qty: 100.00
     - Avg Entry: $0.10
     - Cost basis of $10 implied

## Related Documentation

- [Transaction Structure](./TRANSACTION_STRUCTURE.md) (if exists)
- [Fund Management](./FEATURE_FUND_MANAGEMENT.md) (if exists)
- [Accounting Principles](./ACCOUNTING_PRINCIPLES.md) (if exists)

## Changelog

### 2025-01-16

- **Added**: Cost basis and average entry price tracking
- **Modified**: Position struct to include `cost_basis_usd` and `avg_entry_price_usd`
- **Modified**: `get_positions_for_fund` to extract USDT/USDC pairs
- **Added**: Unrealized P&L display on funds page
- **Updated**: OpenAPI schema with enhanced Position fields
- **Enshrined**: USDT/USDC pairing rule in codebase and documentation
