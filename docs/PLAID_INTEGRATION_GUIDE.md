# Plaid Integration Guide

This guide explains how to set up and use the Plaid integration to sync bank transactions into your Wyat AI capital ledger.

## Overview

The Plaid integration allows you to:

1. Connect your bank accounts securely via Plaid Link
2. Fetch transactions from connected accounts
3. Automatically import them into your `capital_ledger` collection

## Prerequisites

1. **Plaid Account**: Sign up at [Plaid Dashboard](https://dashboard.plaid.com/)
2. **Plaid Credentials**: Obtain your `client_id` and `secret` (use Sandbox for testing)
3. **MongoDB**: Ensure your `wyat` database has:
   - `capital_accounts` collection with your account definitions
   - `capital_ledger` collection for transactions
   - `plaid_items` collection (will be created automatically)

## Backend Setup

### 1. Environment Variables

Add the following to your backend environment (`.env` file or shell):

```bash
PLAID_CLIENT_ID=your_plaid_client_id_here
PLAID_SECRET=your_plaid_secret_here
PLAID_ENV=sandbox  # or "prod" / "production" for production, "dev" / "development" for development
```

**Environment Options:**

- `PLAID_ENV=sandbox` (default): Uses `https://sandbox.plaid.com` for testing
- `PLAID_ENV=development` or `PLAID_ENV=dev`: Uses `https://development.plaid.com`
- `PLAID_ENV=production` or `PLAID_ENV=prod`: Uses `https://production.plaid.com` for live data

**For Sandbox environment** (testing):

- Set `PLAID_ENV=sandbox` (or omit, as it's the default)
- Use your Sandbox credentials
- Test with fake bank credentials

**For Production**:

- Set `PLAID_ENV=prod` or `PLAID_ENV=production`
- Use your Production credentials
- Connect to real bank accounts

### 2. Backend Endpoints

The following endpoints are available:

#### Create Link Token

```
GET /plaid/link-token/create?user_id={user_id}
```

Returns a link token for initializing Plaid Link on the frontend.

#### Exchange Public Token

```
POST /plaid/exchange-public-token
Body: { "public_token": "...", "item_id": "..." }
```

Exchanges the public token for an access token and stores it in MongoDB.

#### Sync Transactions

```
POST /plaid/sync-transactions
Body: {
  "item_id": "...",
  "account_id": "...",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}
```

Fetches transactions from Plaid and imports them into `capital_ledger`.

## Frontend Setup

### 1. Navigate to Plaid Page

The Plaid integration page is available at:

```
http://localhost:3000/services/plaid
```

Or navigate via the sidebar: **Services** → **Plaid Integration**

### 2. Connect Your Bank (Step 1)

1. Click the **"Connect Bank"** button
2. Plaid Link will open in a modal
3. Select your bank (in Sandbox, use test credentials)
4. Complete the authentication flow
5. Your bank connection will be stored

**Sandbox Test Credentials**:

- Username: `user_good`
- Password: `pass_good`

### 3. Sync Transactions (Step 2)

After connecting a bank:

1. **Select Plaid Item**: Choose the connected bank from the dropdown
2. **Your Account ID**: Enter the internal account ID from your `capital_accounts` collection
   - Example: `acct.chase_checking`
   - This maps Plaid transactions to your internal account structure
3. **Date Range**: Select start and end dates for the transaction sync
   - Defaults to the last 30 days
4. Click **"Sync Transactions"**

### 4. Review Results

After syncing, you'll see:

- **Imported**: Number of new transactions added
- **Skipped**: Number of duplicate transactions (already exist)
- **Errors**: Any errors encountered during import

## Transaction Mapping

Plaid transactions are converted to your internal `FlatTransaction` format:

| Plaid Field         | Internal Field  | Notes                         |
| ------------------- | --------------- | ----------------------------- |
| `transaction_id`    | `txid`          | Unique transaction ID         |
| `date`              | `date`          | Transaction date (YYYY-MM-DD) |
| `name`              | `payee`         | Merchant/payee name           |
| `amount`            | `amount_or_qty` | Transaction amount            |
| `iso_currency_code` | `ccy_or_asset`  | Currency (USD, HKD, etc.)     |

### Transaction Direction

- **Positive amounts** (credits to your account) → `Credit` direction
- **Negative amounts** (debits from your account) → `Debit` direction

### Auto-Balancing

Single-leg transactions are automatically balanced with a P&L leg:

- The P&L leg uses `__pnl__` as the account ID
- Category is set to `env_uncategorized` by default
- You can reclassify transactions later via the Capital UI

## MongoDB Collections

### `plaid_items`

Stores connected Plaid items:

```json
{
  "item_id": "item-sandbox-...",
  "access_token": "access-sandbox-...",
  "user_id": "user_123",
  "created_at": 1234567890
}
```

### `capital_ledger`

Transactions imported from Plaid:

```json
{
  "id": "plaid_tx_abc123",
  "ts": 1234567890,
  "posted_ts": 1234567890,
  "source": "plaid_sync",
  "payee": "Starbucks",
  "memo": null,
  "status": "posted",
  "reconciled": false,
  "external_refs": [["plaid_transaction_id", "abc123"]],
  "legs": [
    {
      "account_id": "acct.chase_checking",
      "direction": "Debit",
      "amount": { "kind": "Fiat", "data": { "amount": "5.00", "ccy": "USD" } },
      "category_id": "env_uncategorized"
    },
    {
      "account_id": "__pnl__",
      "direction": "Credit",
      "amount": { "kind": "Fiat", "data": { "amount": "5.00", "ccy": "USD" } },
      "category_id": "env_uncategorized"
    }
  ],
  "tx_type": "spending",
  "balance_state": "Balanced"
}
```

## Troubleshooting

### "Failed to create link token"

- Check that `PLAID_CLIENT_ID` and `PLAID_SECRET` are set correctly
- Verify your Plaid account is active
- Check backend logs for detailed error messages

### "Failed to exchange token"

- Ensure the public token is valid (they expire quickly)
- Check MongoDB connection
- Verify `plaid_items` collection is accessible

### "Failed to sync transactions"

- Verify the `item_id` exists in `plaid_items` collection
- Check that the `account_id` exists in `capital_accounts`
- Ensure date range is valid (not in the future)
- Check Plaid API rate limits

### Transactions Not Appearing

- Verify the sync completed successfully (check response)
- Check `capital_ledger` collection in MongoDB
- Look for the transaction by `external_refs` containing `plaid_transaction_id`
- Check for duplicate `txid` (will be skipped)

## Next Steps

After importing transactions:

1. **Review Transactions**: Go to `/capital` to view imported transactions
2. **Reclassify**: Update categories from `env_uncategorized` to appropriate envelopes
3. **Balance Check**: Verify account balances match your bank statements
4. **Reconcile**: Mark transactions as reconciled after verification

## Security Notes

- Access tokens are stored in MongoDB - ensure your database is secure
- Never commit `.env` files with real credentials
- Use Sandbox for development and testing
- Rotate credentials regularly
- Consider encrypting access tokens at rest for production

## API Reference

For detailed API documentation, see:

- Backend: `backend/src/main.rs` (Plaid handlers)
- Frontend: `frontend/src/app/services/plaid/page.tsx`
- OpenAPI schema: `openapi-schema.json`

## Support

For issues with:

- **Plaid API**: [Plaid Documentation](https://plaid.com/docs/)
- **Wyat AI Integration**: Check backend logs and MongoDB collections
- **Transaction Mapping**: Review `process_batch_import` in `backend/src/capital.rs`
