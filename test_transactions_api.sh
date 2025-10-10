#!/bin/bash

# Test script for the transactions API endpoint
BASE_URL="http://localhost:3000"

echo "🧪 Testing Transactions API Endpoint"
echo "===================================="

echo ""
echo "1. Testing GET /capital/transactions (all transactions):"
curl -s "$BASE_URL/capital/transactions" | jq '.[0:2]' || echo "Failed to fetch all transactions"

echo ""
echo "2. Testing GET /capital/transactions?account_id=acct.chase_credit:"
curl -s "$BASE_URL/capital/transactions?account_id=acct.chase_credit" | jq '.[0:2]' || echo "Failed to fetch Chase transactions"

echo ""
echo "3. Testing GET /capital/transactions?from=1696000000&to=1698591999 (Sept-Oct 2023):"
curl -s "$BASE_URL/capital/transactions?from=1696000000&to=1698591999" | jq '.[0:2]' || echo "Failed to fetch transactions in date range"

echo ""
echo "4. Testing GET /capital/transactions with invalid account_id:"
curl -s "$BASE_URL/capital/transactions?account_id=nonexistent" | jq '.[]' || echo "Failed to fetch with invalid account"

echo ""
echo "✅ API tests completed!"
