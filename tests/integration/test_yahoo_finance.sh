#!/bin/bash

# Test script to fetch VOO (Vanguard S&P 500 ETF) price from Yahoo Finance public API

SYMBOL="VOO"
URL="https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}"

echo "=========================================="
echo "Testing Yahoo Finance Public API"
echo "=========================================="
echo ""
echo "Fetching data for: $SYMBOL"
echo "URL: $URL"
echo ""
echo "-------------------------------------------"
echo "Raw Response:"
echo "-------------------------------------------"

# Yahoo Finance requires a User-Agent header
RESPONSE=$(curl -s -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "$URL")
echo "$RESPONSE" | jq '.'

echo ""
echo "-------------------------------------------"
echo "Extracted Price Information:"
echo "-------------------------------------------"

# Extract current price (regularMarketPrice)
PRICE=$(echo "$RESPONSE" | jq -r '.chart.result[0].meta.regularMarketPrice // "N/A"')
CURRENCY=$(echo "$RESPONSE" | jq -r '.chart.result[0].meta.currency // "N/A"')
SYMBOL_RETURNED=$(echo "$RESPONSE" | jq -r '.chart.result[0].meta.symbol // "N/A"')
MARKET_STATE=$(echo "$RESPONSE" | jq -r '.chart.result[0].meta.marketState // "N/A"')
PREVIOUS_CLOSE=$(echo "$RESPONSE" | jq -r '.chart.result[0].meta.previousClose // "N/A"')
REGULAR_MARKET_TIME=$(echo "$RESPONSE" | jq -r '.chart.result[0].meta.regularMarketTime // "N/A"')

# Convert timestamp to readable date
if [ "$REGULAR_MARKET_TIME" != "N/A" ]; then
    READABLE_TIME=$(date -r "$REGULAR_MARKET_TIME" "+%Y-%m-%d %H:%M:%S %Z" 2>/dev/null || echo "$REGULAR_MARKET_TIME")
else
    READABLE_TIME="N/A"
fi

echo "Symbol: $SYMBOL_RETURNED"
echo "Current Price: $PRICE $CURRENCY"
echo "Previous Close: $PREVIOUS_CLOSE $CURRENCY"
echo "Market State: $MARKET_STATE"
echo "Last Updated: $READABLE_TIME"

echo ""
echo "-------------------------------------------"
echo "Test Complete!"
echo "-------------------------------------------"

# Check if we got a valid price
if [ "$PRICE" != "N/A" ] && [ "$PRICE" != "null" ]; then
    echo "✅ SUCCESS: Got valid price data from Yahoo Finance"
    exit 0
else
    echo "❌ FAILED: Could not retrieve valid price data"
    exit 1
fi

