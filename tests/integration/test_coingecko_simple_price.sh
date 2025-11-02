#!/bin/bash

# Test script to verify CoinGecko simple/price endpoint

SYMBOL="bitcoin"
VS_CURRENCY="usd"
URL="https://api.coingecko.com/api/v3/simple/price?ids=${SYMBOL}&vs_currencies=${VS_CURRENCY}"

echo "=========================================="
echo "Testing CoinGecko Simple Price Endpoint"
echo "=========================================="
echo ""
echo "Coin: $SYMBOL"
echo "Currency: $VS_CURRENCY"
echo "URL: $URL"
echo ""
echo "-------------------------------------------"
echo "Response:"
echo "-------------------------------------------"

RESPONSE=$(curl -s "$URL")
echo "$RESPONSE" | jq '.'

echo ""
echo "-------------------------------------------"
echo "Extracted Price:"
echo "-------------------------------------------"

PRICE=$(echo "$RESPONSE" | jq -r ".${SYMBOL}.${VS_CURRENCY} // \"N/A\"")

echo "Price: \$$PRICE $VS_CURRENCY"

if [ "$PRICE" != "N/A" ] && [ "$PRICE" != "null" ]; then
    echo ""
    echo "✅ SUCCESS: Got valid price from CoinGecko simple/price endpoint"
    exit 0
else
    echo ""
    echo "❌ FAILED: Could not retrieve valid price"
    exit 1
fi

