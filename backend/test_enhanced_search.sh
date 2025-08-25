#!/bin/bash

API_KEY="2ef1076ebf724d5d36320a219693075c5d8db3ea619fd11c663e67dbcb7f5a71"
BASE_URL="http://localhost:3001"

echo "🧪 Testing Enhanced Journal Search with Highlights..."
echo "=================================================="

echo ""
echo "📡 Testing: search with 'history' term"
echo "--------------------------------"
response=$(curl -s -X GET "$BASE_URL/journal/mongo/search/ids?q=history" \
    -H "x-wyat-api-key: $API_KEY")

echo "Response:"
echo "$response" | jq '.[0:2]'

echo ""
echo "📡 Testing: search with 'ceremonial' term"
echo "--------------------------------"
response=$(curl -s -X GET "$BASE_URL/journal/mongo/search/ids?q=ceremonial" \
    -H "x-wyat-api-key: $API_KEY")

echo "Response:"
echo "$response" | jq '.[0:2]'

echo ""
echo "📡 Testing: search with multiple terms 'history,ceremonial'"
echo "--------------------------------"
response=$(curl -s -X GET "$BASE_URL/journal/mongo/search/ids?q=history,ceremonial" \
    -H "x-wyat-api-key: $API_KEY")

echo "Response:"
echo "$response" | jq '.[0:2]'

echo ""
echo "📡 Testing: search with non-existent term"
echo "--------------------------------"
response=$(curl -s -X GET "$BASE_URL/journal/mongo/search/ids?q=nonexistent" \
    -H "x-wyat-api-key: $API_KEY")

echo "Response: $response"

echo ""
echo "📡 Testing: search without query (all entries)"
echo "--------------------------------"
response=$(curl -s -X GET "$BASE_URL/journal/mongo/search/ids" \
    -H "x-wyat-api-key: $API_KEY")

echo "Total entries returned: $(echo "$response" | jq 'length')"
echo "Sample entry:"
echo "$response" | jq '.[0]'

echo ""
echo "✅ Enhanced search testing complete!" 