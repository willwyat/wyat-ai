#!/bin/bash

# Test script for 24h change data in watchlist

BASE_URL="http://localhost:3001"

echo "=========================================="
echo "Testing 24h Change Data for Watchlist"
echo "=========================================="
echo ""

# Step 1: Add bitcoin to watchlist (if not already there)
echo "Step 1: Ensuring bitcoin is in watchlist..."
curl -s -X POST "$BASE_URL/capital/data/watchlist" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "bitcoin",
    "name": "Bitcoin",
    "kind": "crypto",
    "unit": "USD"
  }' > /dev/null 2>&1

echo "✅ Bitcoin added/verified in watchlist"
echo ""

# Step 2: Fetch watchlist and check for 24h change data
echo "Step 2: Fetching watchlist with 24h change data..."
RESPONSE=$(curl -s "$BASE_URL/capital/data/watchlist")

echo "Full response:"
echo "$RESPONSE" | jq '.'
echo ""

# Step 3: Extract bitcoin's 24h change
BITCOIN_DATA=$(echo "$RESPONSE" | jq '.[] | select(.symbol == "bitcoin")')
CHANGE_24H=$(echo "$BITCOIN_DATA" | jq -r '.change_24h_pct')
PRICE=$(echo "$BITCOIN_DATA" | jq -r '.latest_value')

echo "=========================================="
echo "Bitcoin Data:"
echo "=========================================="
echo "Price: \$$PRICE"
echo "24h Change: $CHANGE_24H%"
echo ""

# Step 4: Validate
if [ "$CHANGE_24H" != "null" ] && [ -n "$CHANGE_24H" ]; then
    echo "✅ SUCCESS: 24h change data is present!"
    
    # Determine if positive or negative
    if (( $(echo "$CHANGE_24H >= 0" | bc -l) )); then
        echo "📈 Bitcoin is UP $CHANGE_24H% in the last 24 hours"
    else
        echo "📉 Bitcoin is DOWN $CHANGE_24H% in the last 24 hours"
    fi
else
    echo "❌ FAILED: 24h change data is missing"
    echo "This might mean:"
    echo "  1. Backend is not running"
    echo "  2. CoinGecko API is not responding"
    echo "  3. Data hasn't been fetched yet (try again in a moment)"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ All tests passed!"
echo "=========================================="

