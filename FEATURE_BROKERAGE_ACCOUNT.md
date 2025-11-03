# Brokerage Account Type Implementation

## Overview

Added support for a new account type: **BrokerageAccount**. This allows users to track their investment brokerage accounts (e.g., Fidelity, Charles Schwab, Interactive Brokers) alongside their other financial accounts.

## Changes Made

### Backend Changes

#### 1. **`backend/src/capital.rs`**

**Added BrokerageAccount variant to AccountMetadata enum:**

```rust
BrokerageAccount {
    broker_name: String,
    owner_name: String,
    account_number: String,
    #[serde(default)]
    account_type: Option<String>, // e.g., "Individual", "IRA", "401k", "Roth IRA"
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    txid_prefix: Option<String>,
},
```

**Updated the `kind()` method:**

- Added `"BrokerageAccount" => "BrokerageAccount"` to both the `Tagged` and direct variant match arms

**Features:**

- ✅ Stores broker name (e.g., "Fidelity", "Charles Schwab")
- ✅ Stores owner name
- ✅ Stores account number (can be partial or full)
- ✅ Optional account type field (Individual, IRA, 401k, Roth IRA, etc.)
- ✅ Supports color coding and transaction ID prefixes
- ✅ Compatible with existing account balance calculation endpoints

### Frontend Changes

#### 2. **`frontend/src/app/capital/types.ts`**

**Updated AccountMetadata interface:**

```typescript
type:
  | "Checking"
  | "Savings"
  | "Credit"
  | "CryptoWallet"
  | "Cex"
  | "Trust"
  | "BrokerageAccount";  // ← Added

data:
  // ... existing types ...
  | {
      broker_name: string;
      owner_name: string;
      account_number: string;
      account_type?: string | null;
      color?: string;
      txid_prefix?: string;
    };  // ← Added
```

#### 3. **`frontend/src/app/capital/components/AccountCreateModal.tsx`**

**Added BrokerageAccount creation support:**

- Added `"BrokerageAccount"` to the account type selector dropdown
- Added state variables for brokerage-specific fields:
  - `brokerName`
  - `brokerageAccountType` (optional)
- Added form fields for BrokerageAccount:
  - Broker Name (required)
  - Owner Name (required)
  - Account Number (required)
  - Account Type (optional - e.g., Individual, IRA, 401k, Roth IRA)
- Added reset logic for new fields in `handleClose()`
- Added case in `handleSubmit()` to construct BrokerageAccount metadata

**Form Fields:**

```typescript
{
  accountType === "BrokerageAccount" && (
    <>
      <input placeholder="e.g., Fidelity, Charles Schwab, Interactive Brokers" />
      <input placeholder="e.g., John Doe" />
      <input placeholder="Last 4 digits or full account number" />
      <input placeholder="e.g., Individual, IRA, 401k, Roth IRA" />
    </>
  );
}
```

#### 4. **`frontend/src/app/capital/components/AccountCard.tsx`**

**Added BrokerageAccount display support:**

- **Color coding**: Emerald green theme

  ```typescript
  case "BrokerageAccount":
    return "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300";
  ```

- **Balance fetching**: Included in balance fetch logic (same as Checking/Savings/Credit)

  ```typescript
  const shouldFetchBalance =
    account.metadata.type === "Checking" ||
    account.metadata.type === "Savings" ||
    account.metadata.type === "Credit" ||
    account.metadata.type === "BrokerageAccount"; // ← Added
  ```

- **Compact info display**: Shows broker name and masked account number

  ```typescript
  case "BrokerageAccount": {
    const d = data as { broker_name: string; account_number: string };
    return `${d.broker_name} •••${d.account_number.slice(-4)}`;
  }
  ```

- **Detailed view**: Shows all brokerage account information
  - Broker name
  - Owner name
  - Masked account number (last 4 digits)
  - Account type (if specified)

## Usage

### Creating a Brokerage Account

1. Navigate to `/capital/accounts`
2. Click "Create Account"
3. Select "Brokerage Account" from the dropdown
4. Fill in the required fields:
   - **Account ID**: Unique identifier (e.g., `brokerage_fidelity_main`)
   - **Account Name**: Display name (e.g., "Fidelity Individual")
   - **Currency**: USD (or other supported currency)
   - **Broker Name**: e.g., "Fidelity", "Charles Schwab", "Interactive Brokers"
   - **Owner Name**: Account holder's name
   - **Account Number**: Last 4 digits or full number
   - **Account Type** (optional): e.g., "Individual", "IRA", "401k", "Roth IRA"
5. Click "Create Account"

### Example Account

```json
{
  "id": "brokerage_fidelity_ira",
  "name": "Fidelity Roth IRA",
  "currency": "USD",
  "metadata": {
    "type": "BrokerageAccount",
    "color": "green",
    "data": {
      "broker_name": "Fidelity",
      "owner_name": "John Doe",
      "account_number": "1234",
      "account_type": "Roth IRA",
      "color": "#10B981",
      "txid_prefix": "FID"
    }
  }
}
```

## Features

### Balance Tracking

- ✅ Automatically fetches and displays current balance from ledger
- ✅ Supports historical balance queries
- ✅ Compatible with accounting cycle boundaries

### Visual Design

- ✅ Emerald green color theme for easy identification
- ✅ Displays broker logo placeholder (can be enhanced with actual logos)
- ✅ Masked account number for security (shows last 4 digits)
- ✅ Dark mode compatible

### Transaction Support

- ✅ Can be used as source/destination in transactions
- ✅ Supports transaction ID prefixes (e.g., "FID-" for Fidelity)
- ✅ Compatible with envelope system for categorization

### Account Grouping

- ✅ Supports `group_id` for grouping multiple accounts
- ✅ Can aggregate balances across grouped accounts
- ✅ Maintains individual account details within groups

## Common Brokerage Account Types

The `account_type` field supports various brokerage account classifications:

### Tax-Advantaged Accounts

- **Traditional IRA**: Tax-deferred retirement account
- **Roth IRA**: Tax-free retirement account
- **401(k)**: Employer-sponsored retirement plan
- **403(b)**: Retirement plan for non-profit employees
- **SEP IRA**: Simplified Employee Pension
- **SIMPLE IRA**: Savings Incentive Match Plan

### Taxable Accounts

- **Individual**: Standard taxable brokerage account
- **Joint**: Shared account with another person
- **Trust**: Account held in trust
- **Custodial**: UTMA/UGMA accounts for minors

### Specialized Accounts

- **Margin**: Account with borrowing capability
- **Cash**: Cash-only trading account
- **Options**: Account approved for options trading

## Integration Points

### Existing Endpoints

All existing capital endpoints work with BrokerageAccount:

- `GET /capital/accounts` - Lists all accounts including brokerage
- `GET /capital/accounts/:id/balance` - Gets current balance
- `POST /capital/accounts` - Creates new brokerage account
- `GET /capital/transactions` - Filters by brokerage account
- `POST /capital/transactions` - Creates transactions with brokerage accounts

### Balance Calculation

BrokerageAccount balances are calculated the same way as Checking/Savings/Credit:

- Aggregates all transaction legs for the account
- Supports date-based queries (as_of, from/to, label)
- Returns balance in account's native currency

### Transaction Legs

BrokerageAccount can appear in transaction legs:

```json
{
  "tx_id": "tx_1234567890",
  "legs": [
    {
      "account_id": "brokerage_fidelity_ira",
      "direction": "debit",
      "amount": { "amount": "5000.00", "ccy": "USD" },
      "memo": "IRA contribution"
    },
    {
      "account_id": "checking_chase_main",
      "direction": "credit",
      "amount": { "amount": "5000.00", "ccy": "USD" },
      "memo": "Transfer to IRA"
    }
  ]
}
```

## Future Enhancements

### Potential Additions

1. **Broker Logo Integration**: Display actual broker logos
2. **Account Linking**: Connect to broker APIs for automatic sync
3. **Position Tracking**: Track individual securities within the account
4. **Cost Basis**: Track purchase prices and capital gains
5. **Dividend Tracking**: Record dividend payments
6. **Tax Reporting**: Generate tax documents (1099, etc.)
7. **Performance Metrics**: Calculate returns, Sharpe ratio, etc.
8. **Asset Allocation**: Show portfolio breakdown by asset class
9. **Rebalancing Alerts**: Notify when allocation drifts from target
10. **Multi-Currency Support**: Handle international brokers

### API Integrations

Potential broker API integrations:

- **Plaid**: Already integrated, supports some brokers
- **Alpaca**: Commission-free trading API
- **Interactive Brokers**: Professional trading platform
- **TD Ameritrade**: thinkorswim API
- **E\*TRADE**: Developer API

## Testing

### Manual Testing Steps

1. **Create a brokerage account**:

   ```bash
   curl -X POST http://localhost:3001/capital/accounts \
     -H "Content-Type: application/json" \
     -d '{
       "id": "test_brokerage",
       "name": "Test Fidelity",
       "currency": "USD",
       "metadata": {
         "type": "BrokerageAccount",
         "color": "green",
         "data": {
           "broker_name": "Fidelity",
           "owner_name": "Test User",
           "account_number": "1234",
           "account_type": "Roth IRA"
         }
       }
     }'
   ```

2. **Create a transaction with the brokerage account**:

   ```bash
   curl -X POST http://localhost:3001/capital/transactions \
     -H "Content-Type: application/json" \
     -d '{
       "tx_id": "test_tx_brokerage",
       "timestamp": 1234567890,
       "legs": [
         {
           "account_id": "test_brokerage",
           "direction": "debit",
           "amount": { "amount": "1000.00", "ccy": "USD" },
           "memo": "Initial deposit"
         }
       ]
     }'
   ```

3. **Fetch the balance**:

   ```bash
   curl http://localhost:3001/capital/accounts/test_brokerage/balance
   ```

4. **Verify in frontend**:
   - Navigate to `/capital/accounts`
   - Verify the account appears with emerald green styling
   - Click to expand and verify all details are displayed
   - Check that balance is shown correctly

## Migration Notes

### Existing Accounts

No migration needed - this is a new account type that doesn't affect existing accounts.

### Backward Compatibility

- ✅ All existing account types continue to work
- ✅ No changes to existing API contracts
- ✅ OpenAPI schema automatically updated via Rust compilation

## Documentation Updates

Files updated:

- ✅ `backend/src/capital.rs` - Added BrokerageAccount enum variant
- ✅ `frontend/src/app/capital/types.ts` - Added TypeScript types
- ✅ `frontend/src/app/capital/components/AccountCreateModal.tsx` - Added creation UI
- ✅ `frontend/src/app/capital/components/AccountCard.tsx` - Added display logic
- ✅ `FEATURE_BROKERAGE_ACCOUNT.md` - This documentation

## Related Features

- **Account Grouping**: Group multiple brokerage accounts together
- **Balance Tracking**: Real-time balance calculation from ledger
- **Transaction System**: Full double-entry accounting support
- **Envelope System**: Categorize brokerage transactions
- **Fund Tracking**: Track investment funds and positions
- **Dark Mode**: Full dark mode support for all UI components

## Commit Message

```
feat: Add BrokerageAccount type for investment account tracking

- Add BrokerageAccount variant to backend AccountMetadata enum
- Include broker_name, owner_name, account_number, and optional account_type fields
- Update frontend types to support BrokerageAccount
- Add creation form in AccountCreateModal with brokerage-specific fields
- Implement display logic in AccountCard with emerald green theme
- Enable balance fetching for brokerage accounts
- Support account types: Individual, IRA, 401k, Roth IRA, etc.
- Maintain full compatibility with existing account types
- Add comprehensive documentation in FEATURE_BROKERAGE_ACCOUNT.md
```
