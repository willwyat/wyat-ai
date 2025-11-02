# 24-Hour Price Change Feature

## Overview

Added support for displaying 24-hour price change percentages for cryptocurrency assets in the watchlist, powered by CoinGecko's API.

## What Was Added

### Backend Changes

#### 1. CoinGecko Client (`backend/src/services/coingecko.rs`)

**API Request Enhancement:**

- Updated CoinGecko API URL to include `include_24hr_change=true` parameter
- Example: `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true`

**Response Parsing:**

- Extract `{currency}_24h_change` field from CoinGecko response
- Example response:
  ```json
  {
    "bitcoin": {
      "usd": 110768.0,
      "usd_24h_change": 0.669
    }
  }
  ```

**Metadata Storage:**

- Store 24h change percentage in `DataSnapshotData.metadata` as `change_24h_pct`
- Preserved in MongoDB for historical tracking

#### 2. Capital Module (`backend/src/capital.rs`)

**WatchlistAssetResponse:**

- Added `change_24h_pct: Option<f64>` field

**build_watchlist_response Function:**

- Extract `change_24h_pct` from snapshot metadata
- Pass through to API response

### Frontend Changes

#### 1. Data Store (`frontend/src/stores/capital-data-store.ts`)

**WatchlistAsset Interface:**

- Added `change_24h_pct?: number | null` field
- Automatically populated when fetching watchlist data

#### 2. UI (`frontend/src/app/capital/data/page.tsx`)

**New Table Column:**

- Added "24h Change" column between "Latest Price" and "Last Updated"
- Visual indicators:
  - **Green ↑** for positive changes
  - **Red ↓** for negative changes
  - **—** for unavailable data

**Display Format:**

- Shows percentage with 2 decimal places
- Example: `↑ 0.67%` or `↓ 1.23%`

## Example Output

### API Response

```json
{
  "symbol": "bitcoin",
  "name": "Bitcoin",
  "kind": "crypto",
  "latest_value": 110768.0,
  "change_24h_pct": 0.669,
  "unit": "USD",
  "last_updated": "2025-01-15T15:45:00Z"
}
```

### UI Display

```
Name          Symbol    Source      Latest Price    24h Change    Last Updated
Bitcoin       BITCOIN   Coingecko   $110,768.00     ↑ 0.67%      Jan 15, 3:45 PM
Ethereum      ETHEREUM  Coingecko   $3,862.57       ↓ 1.23%      Jan 15, 3:45 PM
```

## Testing

### Manual Test

1. Start backend: `cd backend && cargo run`
2. Navigate to: `http://localhost:3000/capital/data`
3. Add a crypto asset (e.g., bitcoin)
4. Observe the 24h change column

### Automated Test

```bash
cd tests/integration
./test_24h_change.sh
```

Expected output:

```
==========================================
Bitcoin Data:
==========================================
Price: $110768.00
24h Change: 0.669%

📈 Bitcoin is UP 0.669% in the last 24 hours
✅ All tests passed!
```

## Technical Details

### Data Flow

1. **Fetch**: CoinGecko API returns price + 24h change
2. **Store**: Backend stores in MongoDB `capital_data_snapshots` collection
3. **Serve**: Backend includes in `WatchlistAssetResponse`
4. **Display**: Frontend renders with color-coded indicators

### Backward Compatibility

- ✅ All fields are optional (`Option<f64>`)
- ✅ Existing data without 24h change displays "—"
- ✅ No breaking changes to API or database schema

### Performance

- ✅ No additional API calls (data included in existing request)
- ✅ No performance impact
- ✅ Free on CoinGecko public tier

## Future Enhancements

Potential additions:

- 7-day change
- 30-day change
- Volume data
- Market cap
- Sparkline charts

## Files Modified

### Backend

- `backend/src/services/coingecko.rs` - API integration
- `backend/src/capital.rs` - Response structure

### Frontend

- `frontend/src/stores/capital-data-store.ts` - Type definitions
- `frontend/src/app/capital/data/page.tsx` - UI display

### Tests

- `tests/integration/test_24h_change.sh` - New test script

## API Documentation

### Endpoint

`GET /capital/data/watchlist`

### Response Schema

```typescript
interface WatchlistAsset {
  symbol: string;
  name: string;
  kind: "stock" | "crypto";
  latest_value?: number | null;
  change_24h_pct?: number | null; // NEW FIELD
  unit?: string | null;
  last_updated?: string | null;
}
```

## Notes

- 24h change data is only available for crypto assets via CoinGecko
- Stock assets via Yahoo Finance do not currently include 24h change
- Data refreshes based on `DATA_FEED_MAX_STALENESS_MINUTES` setting
- CoinGecko free tier has rate limits (check their documentation)
