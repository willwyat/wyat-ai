#!/bin/bash

# Test script for meta endpoints
# Make sure the backend is running on port 3001

echo "🧪 Testing Meta Endpoints"
echo "=========================="

BASE_URL="http://localhost:3001"

echo ""
echo "1. Testing Tag Taxonomy endpoint..."
curl -s "$BASE_URL/meta/tag-taxonomy" | jq '.' 2>/dev/null || curl -s "$BASE_URL/meta/tag-taxonomy"

echo ""
echo "2. Testing Keywording Best Practices endpoint..."
curl -s "$BASE_URL/meta/keywording-best-practices" | jq '.' 2>/dev/null || curl -s "$BASE_URL/meta/keywording-best-practices"

echo ""
echo "3. Testing Person Registry endpoint..."
curl -s "$BASE_URL/meta/person-registry" | jq '.' 2>/dev/null || curl -s "$BASE_URL/meta/person-registry"

echo ""
echo "4. Testing Place Registry endpoint..."
curl -s "$BASE_URL/meta/place-registry" | jq '.' 2>/dev/null || curl -s "$BASE_URL/meta/place-registry"

echo ""
echo "✅ Meta endpoints test completed!" 