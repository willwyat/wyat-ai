#!/bin/bash

# Check current accounts in the database
echo "=== Current Accounts ==="
curl -s http://localhost:3001/capital/accounts | jq '.[] | {id, name, group_id, group_order}'

