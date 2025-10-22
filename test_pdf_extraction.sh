#!/bin/bash

# Test PDF extraction with account_id parameter
# Usage: ./test_pdf_extraction.sh <blob_id> <account_id>

BLOB_ID=${1:-""}
ACCOUNT_ID=${2:-"acct.chase_w_checking"}

if [ -z "$BLOB_ID" ]; then
  echo "Usage: ./test_pdf_extraction.sh <blob_id> [account_id]"
  echo "Example: ./test_pdf_extraction.sh 507f1f77bcf86cd799439011 acct.chase_w_checking"
  exit 1
fi

echo "Testing PDF extraction with:"
echo "  Blob ID: $BLOB_ID"
echo "  Account ID: $ACCOUNT_ID"
echo ""

curl -X POST http://localhost:8080/capital/documents/import \
  -H "Content-Type: application/json" \
  -d "{
    \"blob_id\": \"$BLOB_ID\",
    \"namespace\": \"capital\",
    \"kind\": \"bank_statement\",
    \"title\": \"Test Bank Statement\",
    \"account_id\": \"$ACCOUNT_ID\"
  }" | jq '.'

echo ""
echo "Done!"

