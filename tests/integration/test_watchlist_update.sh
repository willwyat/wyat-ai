#!/bin/bash

# Test script for updating watchlist asset names

BASE_URL="http://localhost:3001"

echo "=========================================="
echo "Testing Watchlist Asset Name Update"
echo "=========================================="
echo ""

# Step 1: Add bitcoin to watchlist
echo "Step 1: Adding bitcoin to watchlist..."
ADD_RESPONSE=$(curl -s -X POST "$BASE_URL/capital/data/watchlist" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "bitcoin",
    "name": "Bitcoin",
    "kind": "crypto",
    "unit": "USD"
  }')

if echo "$ADD_RESPONSE" | jq -e '.symbol' > /dev/null 2>&1; then
    echo "✅ Added bitcoin to watchlist"
    echo "Current name: $(echo "$ADD_RESPONSE" | jq -r '.name')"
else
    echo "⚠️  Bitcoin might already be in watchlist (this is OK)"
fi
echo ""

# Step 2: Update the name
echo "Step 2: Updating bitcoin name to 'BTC - Bitcoin'..."
UPDATE_RESPONSE=$(curl -s -X PATCH "$BASE_URL/capital/data/watchlist/bitcoin" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "BTC - Bitcoin"
  }')

echo "Response:"
echo "$UPDATE_RESPONSE" | jq '.'
echo ""

# Step 3: Verify the update
NEW_NAME=$(echo "$UPDATE_RESPONSE" | jq -r '.name')
if [ "$NEW_NAME" = "BTC - Bitcoin" ]; then
    echo "✅ SUCCESS: Name updated to '$NEW_NAME'"
else
    echo "❌ FAILED: Expected 'BTC - Bitcoin', got '$NEW_NAME'"
    exit 1
fi
echo ""

# Step 4: Verify it persists by fetching watchlist
echo "Step 3: Verifying update persists..."
WATCHLIST=$(curl -s "$BASE_URL/capital/data/watchlist")
BITCOIN_NAME=$(echo "$WATCHLIST" | jq -r '.[] | select(.symbol == "bitcoin") | .name')

if [ "$BITCOIN_NAME" = "BTC - Bitcoin" ]; then
    echo "✅ SUCCESS: Update persisted in watchlist"
else
    echo "❌ FAILED: Name in watchlist is '$BITCOIN_NAME'"
    exit 1
fi
echo ""

# Step 5: Update it back
echo "Step 4: Updating name back to 'Bitcoin'..."
curl -s -X PATCH "$BASE_URL/capital/data/watchlist/bitcoin" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bitcoin"
  }' | jq -r '.name'

echo ""
echo "✅ All tests passed!"

