#!/bin/bash

# Test Plaid Integration
# This script tests the Plaid endpoints and provides instructions for frontend testing

API_URL="http://localhost:3001"

echo "=================================="
echo "Plaid Integration Test Suite"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if backend is running
echo "Test 1: Checking if backend is running..."
if curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" | grep -q "200\|404"; then
    echo -e "${GREEN}✓ Backend is running${NC}"
else
    echo -e "${RED}✗ Backend is not running. Start it with: cd backend && cargo run${NC}"
    exit 1
fi
echo ""

# Test 2: Create Plaid Link Token
echo "Test 2: Creating Plaid Link Token..."
LINK_TOKEN_RESPONSE=$(curl -s "$API_URL/plaid/link-token/create")

if echo "$LINK_TOKEN_RESPONSE" | jq -e '.link_token' > /dev/null 2>&1; then
    LINK_TOKEN=$(echo "$LINK_TOKEN_RESPONSE" | jq -r '.link_token')
    echo -e "${GREEN}✓ Link token created successfully${NC}"
    echo "  Link token: ${LINK_TOKEN:0:20}..."
else
    echo -e "${RED}✗ Failed to create link token${NC}"
    echo "  Response: $LINK_TOKEN_RESPONSE"
    echo ""
    echo -e "${YELLOW}Possible issues:${NC}"
    echo "  - Check PLAID_CLIENT_ID and PLAID_SECRET are set correctly"
    echo "  - Verify PLAID_ENV is set to 'prod' or 'sandbox'"
    echo "  - Check backend logs for detailed error"
    exit 1
fi
echo ""

# Test 3: Frontend Testing Instructions
echo "=================================="
echo "Frontend Testing Instructions"
echo "=================================="
echo ""
echo -e "${GREEN}Step 1: Start the frontend${NC}"
echo "  cd frontend && npm run dev"
echo ""
echo -e "${GREEN}Step 2: Open Plaid page${NC}"
echo "  http://localhost:3000/services/plaid"
echo ""
echo -e "${GREEN}Step 3: Connect a bank${NC}"
if [ "$PLAID_ENV" = "prod" ] || [ "$PLAID_ENV" = "production" ]; then
    echo "  - Click 'Connect Bank' button"
    echo "  - Select your actual bank"
    echo "  - Use your real bank credentials"
    echo "  - Complete the authentication flow"
else
    echo "  - Click 'Connect Bank' button"
    echo "  - Select any test bank"
    echo "  - Username: user_good"
    echo "  - Password: pass_good"
    echo "  - Select an account"
fi
echo ""
echo -e "${GREEN}Step 4: Sync transactions${NC}"
echo "  - Select the connected item from dropdown"
echo "  - Enter your account ID (e.g., acct.chase_checking)"
echo "  - Select date range (defaults to last 30 days)"
echo "  - Click 'Sync Transactions'"
echo ""
echo -e "${GREEN}Step 5: Verify in MongoDB${NC}"
echo "  mongosh wyat --eval 'db.plaid_items.find().pretty()'"
echo "  mongosh wyat --eval 'db.capital_ledger.find({source: \"plaid_sync\"}).limit(5).pretty()'"
echo ""

# Test 4: Environment Check
echo "=================================="
echo "Environment Configuration"
echo "=================================="
echo ""
echo "PLAID_CLIENT_ID: ${PLAID_CLIENT_ID:0:10}... (${#PLAID_CLIENT_ID} chars)"
echo "PLAID_SECRET: ${PLAID_SECRET:0:10}... (${#PLAID_SECRET} chars)"
echo "PLAID_ENV: ${PLAID_ENV:-sandbox (default)}"
echo ""

if [ "$PLAID_ENV" = "prod" ] || [ "$PLAID_ENV" = "production" ]; then
    echo -e "${YELLOW}⚠ Using PRODUCTION environment${NC}"
    echo "  - You will connect to real banks"
    echo "  - Use actual bank credentials"
    echo "  - Real transactions will be imported"
else
    echo -e "${GREEN}Using SANDBOX environment${NC}"
    echo "  - Safe for testing"
    echo "  - Use test credentials (user_good/pass_good)"
    echo "  - No real bank data"
fi
echo ""

# Test 5: API Endpoint Summary
echo "=================================="
echo "Available API Endpoints"
echo "=================================="
echo ""
echo "1. Create Link Token:"
echo "   GET $API_URL/plaid/link-token/create"
echo ""
echo "2. Exchange Public Token:"
echo "   POST $API_URL/plaid/exchange-public-token"
echo "   Body: {\"public_token\": \"public-sandbox-...\"}"
echo ""
echo "3. Sync Transactions:"
echo "   POST $API_URL/plaid/sync-transactions"
echo "   Body: {"
echo "     \"item_id\": \"item-sandbox-...\","
echo "     \"account_id\": \"acct.chase_checking\","
echo "     \"start_date\": \"2025-01-01\","
echo "     \"end_date\": \"2025-01-31\""
echo "   }"
echo ""

echo "=================================="
echo "Quick Test Summary"
echo "=================================="
echo ""
echo -e "${GREEN}✓ Backend is running and responding${NC}"
echo -e "${GREEN}✓ Plaid link token can be created${NC}"
echo -e "${GREEN}✓ Environment variables are configured${NC}"
echo ""
echo "Next: Open http://localhost:3000/services/plaid to complete the integration test"
echo ""

