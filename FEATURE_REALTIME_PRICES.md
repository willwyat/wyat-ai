# Real-Time Asset Prices Integration

## Overview

Integrated real-time asset prices from the watchlist/data feeds into the capital store, replacing hardcoded prices on the Funds page with live market data from CoinGecko and Yahoo Finance.

## What Was Added

### Capital Store Enhancement (`frontend/src/stores/capital-store.ts`)

#### New Types

```typescript
export interface AssetPrice {
  symbol: string;
  price: number;
  change_24h_pct?: number;
  last_updated?: string;
  source?: string;
}
```

#### New State

- `assetPrices: Record<string, AssetPrice>` - Map of asset symbols to price data
- `pricesLoading: boolean` - Loading state for price fetching

#### New Actions

**`fetchAssetPrices()`**

- Fetches watchlist data from `/capital/data/watchlist`
- Normalizes symbols to uppercase for consistent lookup
- Maps watchlist items to `AssetPrice` objects
- Stores in `assetPrices` state

**`getAssetPrice(symbol: string)`**

- Helper function to retrieve price for a given asset symbol
- Returns `number | undefined`
- Handles case-insensitive lookups

### Funds Page Update (`frontend/src/app/capital/funds/page.tsx`)

#### Price Resolution Strategy

Implemented a three-tier fallback system:

1. **Real-time data** (from watchlist/data feeds)
2. **Hardcoded fallback prices** (for assets not in watchlist)
3. **Position stored prices** (from ledger data)

```typescript
const getPriceForAsset = (asset: string, fallbackPrice?: number): number => {
  // 1. Try real-time data first
  const realtimePrice = getAssetPrice(asset);
  if (realtimePrice !== undefined) {
    return realtimePrice;
  }

  // 2. Fall back to hardcoded prices
  const normalizedAsset = asset.toUpperCase();
  if (fallbackPrices[normalizedAsset] !== undefined) {
    return fallbackPrices[normalizedAsset];
  }

  // 3. Finally, use price from position data
  return fallbackPrice || 0;
};
```

#### Changes Made

- Added `fetchAssetPrices()` call in `useEffect`
- Replaced all `assetPrices` lookups with `getPriceForAsset()` calls
- Maintained hardcoded prices as fallback
- Updated comments to reflect new pricing strategy

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User visits /capital/funds                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. fetchAssetPrices() called                                │
│    - Fetches from /capital/data/watchlist                   │
│    - Includes 24h change data                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Data normalized and stored in assetPrices map           │
│    {                                                         │
│      "BITCOIN": {                                            │
│        symbol: "BITCOIN",                                    │
│        price: 110768.0,                                      │
│        change_24h_pct: 0.669,                                │
│        source: "Coingecko"                                   │
│      }                                                        │
│    }                                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Funds page calculates NAV using getPriceForAsset()      │
│    - Checks assetPrices first                               │
│    - Falls back to hardcoded prices                         │
│    - Uses position stored price as last resort              │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

### 1. **Real-Time Accuracy**

- Portfolio values reflect current market prices
- No manual price updates needed
- Automatic updates when watchlist refreshes

### 2. **24h Change Tracking**

- Price data includes 24h change percentage
- Available for future UI enhancements (e.g., showing gains/losses)

### 3. **Graceful Degradation**

- Three-tier fallback ensures prices always available
- No breaking changes if watchlist is empty
- Maintains functionality even if API is down

### 4. **Centralized Price Management**

- Single source of truth in capital store
- Reusable across multiple pages
- Easy to extend with additional price sources

### 5. **Performance**

- Prices fetched once on page load
- Cached in store for instant access
- No redundant API calls

## Usage Example

### Before (Hardcoded)

```typescript
const assetPrices = {
  BTC: 109807.7,
  ETH: 3862.57,
  SOL: 186.34,
};

const price = assetPrices[asset] || 0;
```

### After (Real-Time with Fallback)

```typescript
const price = getPriceForAsset(asset, fallbackPrice);
// Automatically uses real-time data if available
```

## Future Enhancements

Potential additions:

- Display price source indicator (real-time vs fallback)
- Show 24h change on fund cards
- Add price staleness warnings
- Implement automatic refresh intervals
- Cache prices in localStorage
- Add price history charts

## Testing

### Manual Test

1. Add assets to watchlist: `/capital/data`
2. Navigate to funds page: `/capital/funds`
3. Verify prices match watchlist data
4. Check console for "Fetching asset prices" logs

### Verification

```typescript
// In browser console on /capital/funds
const store = useCapitalStore.getState();
console.log(store.assetPrices);
// Should show: { BITCOIN: { price: 110768, ... }, ... }
```

## Files Modified

### Frontend

- `frontend/src/stores/capital-store.ts` - Added price state and actions
- `frontend/src/app/capital/funds/page.tsx` - Integrated real-time prices

### Documentation

- `FEATURE_REALTIME_PRICES.md` - This file

## Backward Compatibility

✅ **Fully backward compatible**

- Hardcoded prices still work as fallback
- No breaking changes to existing functionality
- Graceful handling of missing data
- Works even if watchlist is empty

## Performance Impact

- **Initial load**: +1 API call (watchlist fetch)
- **Runtime**: Zero overhead (data cached in store)
- **Memory**: Minimal (~few KB for price map)
- **Network**: No additional calls after initial load

## Related Features

This enhancement builds on:

- 24h price change tracking (see `FEATURE_24H_CHANGE.md`)
- Watchlist data feeds integration
- CoinGecko API integration
- Capital store architecture

## Notes

- Symbol matching is case-insensitive (normalized to uppercase)
- Watchlist must contain assets for real-time prices to work
- Fallback prices ensure functionality even without watchlist data
- Price data includes source attribution for transparency
