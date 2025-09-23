#!/bin/bash

API_KEY="2ef1076ebf724d5d36320a219693075c5d8db3ea619fd11c663e67dbcb7f5a71"
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