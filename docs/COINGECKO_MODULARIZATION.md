# CoinGecko Modularization

## Overview

The CoinGecko API integration has been modularized into a separate `coingecko.rs` file for better code organization and maintainability.

## Changes Made

### New File: `backend/src/services/coingecko.rs`

Created a dedicated `CoingeckoClient` struct that encapsulates all CoinGecko-related functionality:

```rust
pub struct CoingeckoClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
    api_header: String,
}
```

#### Methods:

1. **`new()`** - Constructor for the client
2. **`ping()`** - Health check using CoinGecko's `/ping` endpoint
3. **`fetch_price_snapshot()`** - Fetch price data using `/simple/price` endpoint
4. **`get_source_url()`** - Generate the source URL for a given symbol
5. **`interpolate_url()`** - Helper to interpolate symbols into URLs

### Updated File: `backend/src/services/data_feeds.rs`

**Removed:**

- `coingecko_url`, `coingecko_api_key`, `coingecko_api_header` fields from `DataFeedService`
- `ping_coingecko()` method
- `fetch_coingecko_snapshot()` method

**Added:**

- `coingecko_client: CoingeckoClient` field to `DataFeedService`
- Import: `use super::coingecko::CoingeckoClient;`

**Modified:**

- `new()` - Now instantiates `CoingeckoClient` and passes it to the service
- `source_for()` - Uses `coingecko_client.get_source_url()` instead of direct URL interpolation
- `fetch_snapshot()` - Calls `coingecko_client.fetch_price_snapshot()` for CoinGecko requests

### Updated File: `backend/src/services/mod.rs`

Added the new module:

```rust
pub mod coingecko;
```

## Benefits

1. **Separation of Concerns**: CoinGecko logic is isolated from the general data feeds service
2. **Reusability**: `CoingeckoClient` can be used independently if needed
3. **Testability**: Easier to unit test CoinGecko-specific functionality
4. **Maintainability**: Changes to CoinGecko integration are localized to one file
5. **Scalability**: Easy to add more CoinGecko endpoints (e.g., market cap, volume, historical data)

## API Endpoints Used

### 1. Ping Endpoint

```
GET https://api.coingecko.com/api/v3/ping
```

Response:

```json
{
  "gecko_says": "(V3) To the Moon!"
}
```

### 2. Simple Price Endpoint

```
GET https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies={currency}
```

Example:

```
GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd
```

Response:

```json
{
  "bitcoin": {
    "usd": 110718
  }
}
```

## Environment Variables

Required in `backend/.env`:

```bash
# CoinGecko API Configuration
COINGECKO_API_URL=https://api.coingecko.com/api/v3/simple/price
COINGECKO_API_KEY=your_api_key_here  # Optional, for Pro API
COINGECKO_API_KEY_HEADER=x-cg-demo-api-key  # Optional, default: x-cg-pro-api-key
```

## Usage

### From Frontend

Add a crypto asset to watchlist:

```typescript
const response = await fetch("http://localhost:8080/capital/data/watchlist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Bitcoin",
    symbol: "bitcoin", // Use CoinGecko ID, not ticker
    categories: ["crypto"],
    source: {
      provider: "Coingecko",
      publisher: "CoinGecko",
      publish_url: "https://api.coingecko.com/api/v3/simple/price",
      fetch_method: "GET",
      format: "json",
      parser: "coingecko_market",
    },
  }),
});
```

Fetch current price:

```typescript
const response = await fetch(
  "http://localhost:8080/capital/data/price?symbol=bitcoin&provider=Coingecko"
);
const data = await response.json();
console.log("Bitcoin price:", data.data[0].value);
```

## Testing

Run the test script:

```bash
chmod +x test_coingecko_modular.sh
./test_coingecko_modular.sh
```

Or test manually:

```bash
# Test ping
curl https://api.coingecko.com/api/v3/ping

# Test simple price
curl "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
```

## CoinGecko IDs

When adding crypto assets, use the **CoinGecko ID** (not the ticker symbol):

| Asset    | Ticker | CoinGecko ID |
| -------- | ------ | ------------ |
| Bitcoin  | BTC    | `bitcoin`    |
| Ethereum | ETH    | `ethereum`   |
| Solana   | SOL    | `solana`     |
| USD Coin | USDC   | `usd-coin`   |
| Tether   | USDT   | `tether`     |

Find more IDs at: https://www.coingecko.com/

## Error Handling

The `CoingeckoClient` includes robust error handling:

1. **Ping Check**: Verifies API is reachable before fetching data
2. **HTTP Errors**: Catches 401/403 authentication errors
3. **Parse Errors**: Validates response structure and data presence
4. **Decimal Conversion**: Safely converts float prices to Decimal type

## Future Enhancements

Potential additions to `CoingeckoClient`:

1. **Historical Prices**: Add `fetch_historical_prices()` method
2. **Market Data**: Add `fetch_market_data()` for volume, market cap, etc.
3. **Trending Coins**: Add `fetch_trending()` method
4. **Coin Info**: Add `fetch_coin_info()` for metadata
5. **Rate Limiting**: Implement request throttling for free tier
6. **Caching**: Add in-memory cache for frequently requested prices

## Migration Notes

This is a **non-breaking change**. All existing functionality remains the same:

- Same API endpoints
- Same request/response formats
- Same error handling
- Same environment variables

The only difference is the internal code organization.
