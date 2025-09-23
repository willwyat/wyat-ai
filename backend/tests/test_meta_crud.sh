#!/bin/bash

# Test script for meta CRUD operations
# Make sure the backend is running on port 3001

echo "🧪 Testing Meta CRUD Operations"
echo "================================"

BASE_URL="http://localhost:3001"
API_KEY="2ef1076ebf724d5d36320a219693075c5d8db3ea619fd11c663e67dbcb7f5a71"

echo ""
echo "1. Testing Person CRUD operations..."
echo "-----------------------------------"

echo "Adding a new person..."
curl -s -X POST "$BASE_URL/meta/persons" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "tag": "person_test_user",
    "name": "Test User",
    "nicknames": ["Test", "TU"],
    "visibility": "public"
  }' | jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/meta/persons" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{"tag": "person_test_user", "name": "Test User", "nicknames": ["Test", "TU"], "visibility": "public"}'

echo ""
echo "Updating the person..."
curl -s -X PATCH "$BASE_URL/meta/persons" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "tag": "person_test_user",
    "nicknames": ["Test", "TU", "Updated Nickname"]
  }' | jq '.' 2>/dev/null || curl -s -X PATCH "$BASE_URL/meta/persons" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{"tag": "person_test_user", "nicknames": ["Test", "TU", "Updated Nickname"]}'

echo ""
echo "2. Testing Place CRUD operations..."
echo "----------------------------------"

echo "Adding a new place..."
curl -s -X POST "$BASE_URL/meta/places" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "tag": "place_test_location",
    "name": "Test Location",
    "aliases": ["TL", "TestLoc"],
    "notes": "This is a test location for testing purposes",
    "visibility": "public"
  }' | jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/meta/places" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{"tag": "place_test_location", "name": "Test Location", "aliases": ["TL", "TestLoc"], "notes": "This is a test location for testing purposes", "visibility": "public"}'

echo ""
echo "Updating the place notes..."
curl -s -X PATCH "$BASE_URL/meta/places" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "tag": "place_test_location",
    "notes": "This is an updated test location with new notes"
  }' | jq '.' 2>/dev/null || curl -s -X PATCH "$BASE_URL/meta/places" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{"tag": "place_test_location", "notes": "This is an updated test location with new notes"}'

echo ""
echo "3. Testing duplicate tag protection..."
echo "-------------------------------------"

echo "Trying to add person with duplicate tag..."
curl -s -X POST "$BASE_URL/meta/persons" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "tag": "person_test_user",
    "name": "Another Test User",
    "visibility": "public"
  }' | jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/meta/persons" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{"tag": "person_test_user", "name": "Another Test User", "visibility": "public"}'

echo ""
echo "4. Testing GET operations..."
echo "----------------------------"

echo "Getting person registry..."
curl -s "$BASE_URL/meta/person-registry" | jq '.' 2>/dev/null || curl -s "$BASE_URL/meta/person-registry"

echo ""
echo "Getting place registry..."
curl -s "$BASE_URL/meta/place-registry" | jq '.' 2>/dev/null || curl -s "$BASE_URL/meta/place-registry"

echo ""
echo "5. Cleaning up test data..."
echo "---------------------------"

echo "Deleting test person..."
curl -s -X DELETE "$BASE_URL/meta/persons/person_test_user" \
  -H "x-wyat-api-key: $API_KEY" | jq '.' 2>/dev/null || curl -s -X DELETE "$BASE_URL/meta/persons/person_test_user" \
  -H "x-wyat-api-key: $API_KEY"

echo ""
echo "Deleting test place..."
curl -s -X DELETE "$BASE_URL/meta/places/place_test_location" \
  -H "x-wyat-api-key: $API_KEY" | jq '.' 2>/dev/null || curl -s -X DELETE "$BASE_URL/meta/places/place_test_location" \
  -H "x-wyat-api-key: $API_KEY"

echo ""
echo "✅ Meta CRUD operations test completed!" 