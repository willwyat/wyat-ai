#!/bin/bash

# Test the bank statement extraction endpoint
# Usage: ./test_extract_endpoint.sh <blob_id> <prompt_id>

BLOB_ID="${1:-67a1b2c3d4e5f6789abcdef0}"  # Replace with actual blob_id
PROMPT_ID="${2:-capital.extract_bank_statement}"

echo "=== Testing Bank Statement Extraction Endpoint ==="
echo "Blob ID: $BLOB_ID"
echo "Prompt ID: $PROMPT_ID"
echo

# Step 1: Get the AI prompt
echo "Step 1: Fetching AI prompt..."
PROMPT_RESPONSE=$(curl -s http://localhost:3001/ai/prompts/$PROMPT_ID)
echo "Prompt fetched successfully"
echo

# Extract fields from prompt
PROMPT_TEMPLATE=$(echo "$PROMPT_RESPONSE" | jq -r '.prompt_template')
MODEL=$(echo "$PROMPT_RESPONSE" | jq -r '.model // "gpt-4o-mini"')

echo "Model: $MODEL"
echo "Prompt template length: ${#PROMPT_TEMPLATE} chars"
echo

# Step 2: Call extraction endpoint
echo "Step 2: Calling extraction endpoint..."
echo "This may take 30-60 seconds..."
echo

EXTRACT_RESPONSE=$(curl -s -X POST http://localhost:3001/ai/extract/bank-statement \
  -H "Content-Type: application/json" \
  -d "{
    \"blob_id\": \"$BLOB_ID\",
    \"prompt\": $(echo "$PROMPT_TEMPLATE" | jq -R -s .),
    \"model\": \"$MODEL\",
    \"assistant_name\": \"Bank Statement Extractor\"
  }")

echo "=== Extraction Response ==="
echo "$EXTRACT_RESPONSE" | jq .

# Save to file
echo
echo "Saving response to extraction_result.json..."
echo "$EXTRACT_RESPONSE" | jq . > extraction_result.json
echo "Done! Check extraction_result.json for full response"

