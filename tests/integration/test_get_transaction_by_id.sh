#!/bin/bash

# Test script for GET /capital/transactions/:transaction_id endpoint

BASE_URL="http://localhost:3001"
TRANSACTION_ID="tx_1761951304189"

echo "=========================================="
echo "Testing GET /capital/transactions/:transaction_id"
echo "=========================================="
echo ""

echo "1. Fetching transaction: $TRANSACTION_ID"
echo "---"
curl -s -X GET "$BASE_URL/capital/transactions/$TRANSACTION_ID" | jq '.'
echo ""
echo ""

echo "2. Testing with non-existent transaction ID"
echo "---"
curl -s -X GET "$BASE_URL/capital/transactions/tx_nonexistent" | jq '.'
echo ""
echo ""

echo "=========================================="
echo "Test complete!"
echo "=========================================="

