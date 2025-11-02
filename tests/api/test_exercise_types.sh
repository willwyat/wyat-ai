#!/bin/bash

# Test script for Exercise Type endpoints
# Make sure the backend is running on localhost:3001

API_URL="http://localhost:3001"
API_KEY="${WYAT_API_KEY:-your-test-api-key-here}"

echo "🏋️ Testing Exercise Type Endpoints"
echo "=================================="

# Test 1: Create a valid exercise type
echo -e "\n1. Testing valid exercise type creation (Bench Press)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "Bench Press",
    "aliases": ["chest press", "barbell bench"],
    "primary_muscles": ["chest", "triceps", "shoulders"],
    "guidance": [
      "Keep your back flat against the bench",
      "Lower the bar to your chest with control",
      "Press up explosively but controlled"
    ],
    "default_load_basis": "total"
  }' | jq '.'

# Test 2: Create another exercise type (Squat)
echo -e "\n2. Testing valid exercise type creation (Squat)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "Squat",
    "aliases": ["barbell squat", "back squat"],
    "primary_muscles": ["quads", "glutes", "hamstrings"],
    "guidance": [
      "Keep your chest up and core tight",
      "Lower until thighs are parallel to floor",
      "Drive through heels to stand up"
    ],
    "default_load_basis": "total"
  }' | jq '.'

# Test 3: Create cardio exercise type (no load basis)
echo -e "\n3. Testing cardio exercise type creation (Running)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "Running",
    "aliases": ["jogging", "cardio run"],
    "primary_muscles": ["quads", "hamstrings", "calves"],
    "guidance": [
      "Maintain good posture",
      "Land on forefoot, not heel",
      "Keep a steady breathing rhythm"
    ]
  }' | jq '.'

# Test 4: Test duplicate name (should fail)
echo -e "\n4. Testing duplicate name (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "Bench Press",
    "aliases": [],
    "primary_muscles": [],
    "guidance": []
  }' | jq '.'

# Test 5: Test case-insensitive duplicate (should fail)
echo -e "\n5. Testing case-insensitive duplicate (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "bench press",
    "aliases": [],
    "primary_muscles": [],
    "guidance": []
  }' | jq '.'

# Test 6: Test invalid muscle names (should fail)
echo -e "\n6. Testing invalid muscle names (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "Test Exercise",
    "aliases": [],
    "primary_muscles": ["Chest", "InvalidMuscle"],
    "guidance": []
  }' | jq '.'

# Test 7: Test invalid load basis (should fail)
echo -e "\n7. Testing invalid load basis (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "Test Exercise 2",
    "aliases": [],
    "primary_muscles": ["chest"],
    "guidance": [],
    "default_load_basis": "InvalidBasis"
  }' | jq '.'

# Test 8: Test missing API key (should fail)
echo -e "\n8. Testing missing API key (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Exercise 3",
    "aliases": [],
    "primary_muscles": [],
    "guidance": []
  }' | jq '.'

# Test 9: Test invalid API key (should fail)
echo -e "\n9. Testing invalid API key (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: invalid-key" \
  -d '{
    "name": "Test Exercise 4",
    "aliases": [],
    "primary_muscles": [],
    "guidance": []
  }' | jq '.'

# Test 10: Test empty name (should fail)
echo -e "\n10. Testing empty name (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "",
    "aliases": [],
    "primary_muscles": [],
    "guidance": []
  }' | jq '.'

# Test 11: Test whitespace-only name (should fail)
echo -e "\n11. Testing whitespace-only name (should fail)..."
curl -X POST "$API_URL/workout/exercise-types" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '{
    "name": "   ",
    "aliases": [],
    "primary_muscles": [],
    "guidance": []
  }' | jq '.'

# Test 12: Get all exercise types
echo -e "\n12. Testing GET all exercise types..."
curl -X GET "$API_URL/workout/exercise-types" \
  -H "x-wyat-api-key: $API_KEY" | jq '.'

# Test 13: Test muscle search endpoint
echo -e "\n13. Testing muscle search endpoint..."
curl -X POST "$API_URL/workout/exercise-types/find-by-muscle" \
  -H "Content-Type: application/json" \
  -H "x-wyat-api-key: $API_KEY" \
  -d '["chest", "triceps"]' | jq '.'

echo -e "\n✅ Exercise Type endpoint tests completed!"
echo "=================================="
