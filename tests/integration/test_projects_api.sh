#!/bin/bash

# Test script for Projects API endpoints
# Usage: ./test_projects_api.sh

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
API_KEY="${WYAT_API_KEY:-}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================="
echo "Testing Projects API Endpoints"
echo "=================================="
echo "API URL: $API_URL"
echo ""

# Test 1: GET /projects
echo -e "${YELLOW}Test 1: GET /projects${NC}"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/projects" \
  -H "x-wyat-api-key: $API_KEY" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}✓ GET /projects: Success (HTTP $http_code)${NC}"
  echo "Response: $body" | head -c 200
  echo "..."
else
  echo -e "${RED}✗ GET /projects: Failed (HTTP $http_code)${NC}"
  echo "Response: $body"
fi
echo ""

# Test 2: GET /project-planning
echo -e "${YELLOW}Test 2: GET /project-planning${NC}"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/project-planning" \
  -H "x-wyat-api-key: $API_KEY" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}✓ GET /project-planning: Success (HTTP $http_code)${NC}"
  echo "Response: $body" | head -c 200
  echo "..."
else
  echo -e "${RED}✗ GET /project-planning: Failed (HTTP $http_code)${NC}"
  echo "Response: $body"
fi
echo ""

# Test 3: GET /projects/with-planning
echo -e "${YELLOW}Test 3: GET /projects/with-planning${NC}"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/projects/with-planning" \
  -H "x-wyat-api-key: $API_KEY" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo -e "${GREEN}✓ GET /projects/with-planning: Success (HTTP $http_code)${NC}"
  echo "Response: $body" | head -c 200
  echo "..."
else
  echo -e "${RED}✗ GET /projects/with-planning: Failed (HTTP $http_code)${NC}"
  echo "Response: $body"
fi
echo ""

# Test 4: GET /projects/:id (with non-existent slug)
echo -e "${YELLOW}Test 4: GET /projects/:id (non-existent)${NC}"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/projects/non-existent-slug-12345" \
  -H "x-wyat-api-key: $API_KEY" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "404" ]; then
  echo -e "${GREEN}✓ GET /projects/:id (non-existent): Correctly returns 404${NC}"
else
  echo -e "${RED}✗ GET /projects/:id (non-existent): Expected 404, got $http_code${NC}"
fi
echo ""

# Test 5: GET /project-planning/:id (with non-existent slug)
echo -e "${YELLOW}Test 5: GET /project-planning/:id (non-existent)${NC}"
response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/project-planning/non-existent-slug-12345" \
  -H "x-wyat-api-key: $API_KEY" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "404" ]; then
  echo -e "${GREEN}✓ GET /project-planning/:id (non-existent): Correctly returns 404${NC}"
else
  echo -e "${RED}✗ GET /project-planning/:id (non-existent): Expected 404, got $http_code${NC}"
fi
echo ""

echo "=================================="
echo "Test Summary"
echo "=================================="
echo "✓ All basic endpoint tests completed"
echo ""
echo "Note: For full testing, add sample data to MongoDB:"
echo "  - projects collection"
echo "  - project_planning collection"
echo ""

