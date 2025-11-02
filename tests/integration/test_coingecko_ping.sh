#!/bin/bash

# Test script to verify CoinGecko API ping endpoint

PING_URL="https://api.coingecko.com/api/v3/ping"

echo "=========================================="
echo "Testing CoinGecko Ping Endpoint"
echo "=========================================="
echo ""
echo "URL: $PING_URL"
echo ""
echo "-------------------------------------------"
echo "Response:"
echo "-------------------------------------------"

RESPONSE=$(curl -s "$PING_URL")
echo "$RESPONSE" | jq '.'

echo ""
echo "-------------------------------------------"
echo "Status Check:"
echo "-------------------------------------------"

GECKO_SAYS=$(echo "$RESPONSE" | jq -r '.gecko_says // "N/A"')

echo "Message: $GECKO_SAYS"

if [ "$GECKO_SAYS" != "N/A" ] && [ "$GECKO_SAYS" != "null" ]; then
    echo ""
    echo "✅ SUCCESS: CoinGecko API is healthy and reachable"
    exit 0
else
    echo ""
    echo "❌ FAILED: CoinGecko API ping failed"
    exit 1
fi

