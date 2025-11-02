# Debug Logging Guide

## Overview

Comprehensive logging has been added to both frontend and backend for debugging the CoinGecko integration and watchlist functionality.

## Backend Logging

### Files Modified:

#### 1. `backend/src/services/coingecko.rs`

**`ping()` method:**

```
=== COINGECKO PING START ===
Ping URL: https://api.coingecko.com/api/v3/ping
API Key present: true/false
Adding API key header: x-cg-demo-api-key (if key present)
Sending ping request...
Ping response status: 200
Ping response payload: {"gecko_says":"(V3) To the Moon!"}
✅ CoinGecko ping successful
=== COINGECKO PING END ===
```

**`fetch_price_snapshot()` method:**

```
=== COINGECKO FETCH PRICE START ===
Feed symbol: bitcoin
Pair: None
Unit: Some("usd")
[... ping logs ...]
Price fetch URL: https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
VS Currency: usd
Adding API key header for price fetch (if key present)
Sending price request...
Price response status: 200
Price response payload: {"bitcoin":{"usd":110718}}
Coin data: {"usd":110718}
Extracted price: 110718
Decimal value: 110718
Asset symbol (uppercase): BITCOIN
✅ Successfully created snapshot for bitcoin
=== COINGECKO FETCH PRICE END ===
```

#### 2. `backend/src/capital.rs`

**`add_watchlist_asset()` function:**

```
=== ADD WATCHLIST ASSET START ===
Request: symbol=bitcoin, name=Bitcoin, kind=Crypto, pair=None, unit=Some("USD")
Creating DataFeedService...
Normalized symbol: bitcoin -> bitcoin
Checking if asset already exists in watchlist...
✅ Asset not in watchlist, proceeding...
Provider: Coingecko
Processed pair: None, unit: Some("USD")
Checking for existing feed...
Creating new feed for bitcoin (or "Found existing feed for bitcoin")
Updating feed metadata...
Fetching latest price snapshot...
[... CoinGecko logs ...]
✅ Successfully fetched snapshot
Creating watchlist entry...
Inserting entry into watchlist collection...
✅ Successfully inserted watchlist entry
Building response...
✅ Successfully added bitcoin to watchlist
=== ADD WATCHLIST ASSET END ===
```

## Frontend Logging

### Files Modified:

#### 1. `frontend/src/stores/capital-data-store.ts`

**`addWatchlistAsset()` method:**

```javascript
=== ADD WATCHLIST ASSET START (Frontend) ===
Payload: {symbol: "bitcoin", name: "Bitcoin", kind: "crypto", pair: undefined, unit: "USD"}
Request URL: http://localhost:8080/capital/data/watchlist
Request body: {
  "symbol": "bitcoin",
  "name": "Bitcoin",
  "kind": "crypto",
  "unit": "USD"
}
Response status: 200
Response ok: true
✅ Received asset: {symbol: "bitcoin", name: "Bitcoin", ...}
✅ Successfully added to watchlist
=== ADD WATCHLIST ASSET END (Frontend) ===
```

#### 2. `frontend/src/app/capital/data/page.tsx`

**`handleSubmit()` function:**

```javascript
=== FORM SUBMIT START ===
Raw form data: {symbol: "bitcoin", name: "Bitcoin", kind: "crypto", pair: "", unit: "USD"}
Processed payload: {symbol: "bitcoin", name: "Bitcoin", kind: "crypto", unit: "USD"}
✅ Validation passed, calling addWatchlistAsset...
[... store logs ...]
✅ Successfully added to watchlist, resetting form
=== FORM SUBMIT END (Success) ===
```

## How to Use

### 1. Start Backend with Logs

```bash
cd backend
cargo run
```

Backend logs will appear in the terminal where you ran `cargo run`.

### 2. Open Frontend with Browser Console

```bash
cd frontend
npm run dev
```

Open browser DevTools (F12) → Console tab to see frontend logs.

### 3. Test Adding a Crypto Asset

1. Navigate to `http://localhost:3000/capital/data`
2. Select "Crypto (Coingecko)" as Asset Type
3. Enter:
   - Symbol: `bitcoin`
   - Name: `Bitcoin`
   - Unit: `USD`
4. Click "Add to Watchlist"

### 4. Monitor Logs

**Frontend Console (Browser):**

- Form validation
- API request details
- Response handling
- Error messages

**Backend Terminal:**

- Request parsing
- Database operations
- CoinGecko API calls
- Price fetching
- Response building

## Log Markers

### Success Markers ✅

- `✅ CoinGecko ping successful`
- `✅ Successfully fetched snapshot`
- `✅ Successfully added to watchlist`
- `✅ Validation passed`

### Error Markers ❌

- `❌ Ping failed with status: 401`
- `❌ Coin 'xyz' not found in response`
- `❌ Authentication failed`
- `❌ Failed to fetch snapshot`
- `❌ Validation failed`

### Section Markers

- `=== SECTION START ===`
- `=== SECTION END ===`

## Common Issues & Logs

### Issue 1: Wrong CoinGecko ID

**Frontend:**

```
Processed payload: {symbol: "btc", name: "Bitcoin", kind: "crypto"}
```

**Backend:**

```
Normalized symbol: btc -> btc
Price response payload: {}
❌ Coin 'btc' not found in response
```

**Solution:** Use `bitcoin` instead of `btc`

### Issue 2: Missing API Configuration

**Backend:**

```
Creating DataFeedService...
❌ Failed to create DataFeedService: missing config: COINGECKO_API_URL
```

**Solution:** Add `COINGECKO_API_URL` to `backend/.env`

### Issue 3: CoinGecko API Down

**Backend:**

```
=== COINGECKO PING START ===
Ping URL: https://api.coingecko.com/api/v3/ping
Sending ping request...
❌ Ping failed with status: 503
```

**Solution:** Wait for CoinGecko to recover or check their status page

### Issue 4: Rate Limiting

**Backend:**

```
Price response status: 429
❌ Authentication failed: 429 Too Many Requests
```

**Solution:** Wait before retrying or upgrade to CoinGecko Pro

## Debugging Tips

### 1. Check Full Request Flow

Follow logs from top to bottom:

```
Frontend Form → Frontend Store → Backend Endpoint → DataFeedService → CoinGecko Client → CoinGecko API
```

### 2. Verify Symbol Normalization

Look for:

```
Normalized symbol: BITCOIN -> bitcoin
```

Crypto symbols should be lowercase.

### 3. Check API Response Structure

Look for:

```
Price response payload: {"bitcoin":{"usd":110718}}
```

If empty `{}`, the symbol is wrong.

### 4. Verify Environment Variables

Backend should show:

```
API Key present: true
```

If false, check `backend/.env` for `COINGECKO_API_KEY`.

### 5. Monitor Network Tab

In browser DevTools → Network tab:

- Check request payload
- Check response status
- Check response body
- Check timing

## Removing Logs

Once debugging is complete, you can remove logs by:

1. **Backend:** Remove `println!` and `eprintln!` statements
2. **Frontend:** Remove `console.log` and `console.error` statements

Or keep them for production debugging (they're harmless).

## Log Levels

Current implementation uses:

- `println!` - Info/Debug messages
- `eprintln!` - Error messages
- `console.log` - Info/Debug messages (frontend)
- `console.error` - Error messages (frontend)

For production, consider using a proper logging framework:

- Backend: `tracing` or `log` crate
- Frontend: Custom logger with log levels
