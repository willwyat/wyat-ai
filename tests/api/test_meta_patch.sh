#!/bin/bash

# Test script for meta PATCH endpoints
# Make sure the backend is running on port 3001

echo "🧪 Testing Meta PATCH Endpoints"
echo "================================"

BASE_URL="http://localhost:3001"
API_KEY="${WYAT_API_KEY:-your-test-api-key-here}"

echo ""
echo "1. Testing PATCH Tag Taxonomy endpoint..."
echo "Updating title and version..."
curl -s -X PATCH "$BASE_URL/meta/tag-taxonomy" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "title": "Updated Tag Taxonomy",
    "version": "2025-08"
  }' | jq '.' 2>/dev/null || curl -s -X PATCH "$BASE_URL/meta/tag-taxonomy" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{"title": "Updated Tag Taxonomy", "version": "2025-08"}'

echo ""
echo "2. Testing PATCH Keywording Best Practices endpoint..."
echo "Updating content..."
curl -s -X PATCH "$BASE_URL/meta/keywording-best-practices" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "content": "# Updated Keywording Best Practices\n\nThis is an updated version with new content.",
    "version": "2025-08"
  }' | jq '.' 2>/dev/null || curl -s -X PATCH "$BASE_URL/meta/keywording-best-practices" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{"content": "# Updated Keywording Best Practices\n\nThis is an updated version with new content.", "version": "2025-08"}'

echo ""
echo "✅ Meta PATCH endpoints test completed!" 