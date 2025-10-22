#!/bin/bash

# Test the AI prompt endpoints
echo "=== Testing AI Prompt Endpoints ==="
echo ""

# Test 1: Get specific prompt
echo "1. Fetching capital.extract_bank_statement prompt..."
curl -s http://localhost:3001/ai/prompts/capital.extract_bank_statement | jq '{
  id,
  namespace,
  task,
  version,
  model,
  description,
  prompt_length: (.prompt_template | length),
  created_at,
  updated_at
}'

echo ""
echo "---"
echo ""

# Test 2: List all prompts in capital namespace
echo "2. Listing all capital prompts..."
curl -s 'http://localhost:3001/ai/prompts?namespace=capital' | jq '.[] | {
  id,
  namespace,
  task,
  model
}'

echo ""
echo "---"
echo ""

# Test 3: Show first 200 chars of prompt template
echo "3. First 200 chars of prompt template..."
curl -s http://localhost:3001/ai/prompts/capital.extract_bank_statement | \
  jq -r '.prompt_template' | head -c 200
echo "..."

echo ""
echo ""
echo "=== Done ==="

