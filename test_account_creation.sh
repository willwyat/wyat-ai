#!/bin/bash

# Test script for account creation endpoint

API_URL="http://localhost:3001"

echo "=== Testing Account Creation Endpoint ==="
echo ""

# Test 1: Create a Checking account
echo "Test 1: Creating a Checking account..."
curl -X POST "${API_URL}/capital/accounts" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "acct.test_checking",
    "name": "Test Checking Account",
    "currency": "USD",
    "metadata": {
      "type": "Checking",
      "color": "blue",
      "data": {
        "bank_name": "Test Bank",
        "owner_name": "Test User",
        "account_number": "1234567890",
        "routing_number": "021000021",
        "color": "#3B82F6",
        "txid_prefix": "test"
      }
    }
  }'
echo -e "\n"

# Test 2: Create a Crypto Wallet account
echo "Test 2: Creating a Crypto Wallet account..."
curl -X POST "${API_URL}/capital/accounts" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "acct.test_wallet",
    "name": "Test Ethereum Wallet",
    "currency": "USD",
    "metadata": {
      "type": "CryptoWallet",
      "color": "orange",
      "data": {
        "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        "network": {
          "EVM": {
            "chain_name": "Ethereum",
            "chain_id": 1
          }
        },
        "is_ledger": true,
        "color": "#F97316",
        "txid_prefix": "eth"
      }
    }
  }'
echo -e "\n"

# Test 3: Try to create duplicate (should fail)
echo "Test 3: Attempting to create duplicate account (should fail)..."
curl -X POST "${API_URL}/capital/accounts" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "acct.test_checking",
    "name": "Duplicate Account",
    "currency": "USD",
    "metadata": {
      "type": "Checking",
      "color": "blue",
      "data": {
        "bank_name": "Test Bank",
        "owner_name": "Test User",
        "account_number": "9999999999"
      }
    }
  }'
echo -e "\n"

# Test 4: Fetch all accounts
echo "Test 4: Fetching all accounts..."
curl -X GET "${API_URL}/capital/accounts"
echo -e "\n"

echo ""
echo "=== Tests Complete ==="

