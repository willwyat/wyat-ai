#!/bin/bash

API_KEY="${WYAT_API_KEY:-your-test-api-key-here}"
BASE_URL="http://localhost:3001"

echo "🧪 Testing Journal Search Endpoints..."
echo "======================================"

echo ""
echo "📡 Testing: search_journal_entries (returns full entries)"
echo "--------------------------------"
response=$(curl -s -X GET "$BASE_URL/journal/mongo/search?q=history,ceremonial" \
    -H "x-wyat-api-key: $API_KEY")

echo "Response: $response"
echo ""

echo "📡 Testing: search_journal_entries_return_ids (returns only IDs)"
echo "--------------------------------"
response_ids=$(curl -s -X GET "$BASE_URL/journal/mongo/search/ids?q=history,ceremonial" \
    -H "x-wyat-api-key: $API_KEY")

echo "Response: $response_ids"
echo ""

echo "📡 Testing: search_journal_entries_return_ids (no query - should return all IDs)"
echo "--------------------------------"
response_all=$(curl -s -X GET "$BASE_URL/journal/mongo/search/ids" \
    -H "x-wyat-api-key: $API_KEY")

echo "Response: $response_all"
echo ""

echo "✅ All endpoints tested!" 