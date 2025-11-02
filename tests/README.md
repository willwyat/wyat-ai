# Tests Directory

This directory contains all test scripts for the Wyat AI project.

## Directory Structure

```
tests/
├── api/              # Backend API endpoint tests
├── integration/      # Integration and feature tests
├── utils/           # Utility scripts for testing
└── README.md        # This file
```

## API Tests (`tests/api/`)

Tests for individual backend API endpoints. These require the backend to be running on `localhost:3001`.

| Script                       | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `test_enhanced_search.sh`    | Tests journal search with highlights                   |
| `test_exercise_types.sh`     | Tests workout exercise type CRUD operations            |
| `test_get_entries_by_day.sh` | Tests journal entries by day endpoint                  |
| `test_journal_search.sh`     | Tests journal search functionality                     |
| `test_meta_crud.sh`          | Tests metadata CRUD operations (persons, places, tags) |
| `test_meta_endpoints.sh`     | Tests metadata endpoints                               |
| `test_meta_patch.sh`         | Tests metadata PATCH operations                        |
| `test_oura_endpoints.sh`     | Tests Oura Ring integration endpoints                  |

### Running API Tests

```bash
# Set your API key
export WYAT_API_KEY=your-api-key-here

# Start the backend
cd backend && cargo run

# In another terminal, run a test
cd tests/api
./test_exercise_types.sh
```

## Integration Tests (`tests/integration/`)

End-to-end integration tests for features that span multiple components.

| Script                           | Description                           |
| -------------------------------- | ------------------------------------- |
| `test_account_creation.sh`       | Tests capital account creation        |
| `test_coingecko_modular.sh`      | Tests modular CoinGecko integration   |
| `test_coingecko_ping.sh`         | Tests CoinGecko API health check      |
| `test_coingecko_simple_price.sh` | Tests CoinGecko simple price endpoint |
| `test_extract_endpoint.sh`       | Tests document extraction endpoint    |
| `test_get_transaction_by_id.sh`  | Tests transaction retrieval by ID     |
| `test_pdf_extraction.sh`         | Tests PDF extraction functionality    |
| `test_plaid_integration.sh`      | Tests Plaid bank integration          |
| `test_prompt_endpoint.sh`        | Tests AI prompt endpoint              |
| `test_transactions_api.sh`       | Tests transaction API operations      |
| `test_yahoo_finance.sh`          | Tests Yahoo Finance integration       |

### Running Integration Tests

```bash
# Most integration tests require both backend and external services
cd tests/integration
./test_coingecko_ping.sh
```

## Utility Scripts (`tests/utils/`)

Helper scripts for testing and debugging.

| Script              | Description                                 |
| ------------------- | ------------------------------------------- |
| `check_accounts.sh` | Lists all accounts in MongoDB for debugging |

### Running Utility Scripts

```bash
cd tests/utils
./check_accounts.sh
```

## Prerequisites

### Environment Variables

All tests require environment variables to be set. See the main project's `SECURITY.md` for details.

**Required:**

```bash
export WYAT_API_KEY=your-api-key
export MONGODB_URI=mongodb://localhost:27017
```

**Optional (depending on test):**

```bash
export OPENAI_API_SECRET=sk-your-key
export COINGECKO_API_KEY=your-key
export PLAID_CLIENT_ID=your-id
export PLAID_SECRET=your-secret
```

### Services

Different tests require different services to be running:

- **API Tests**: Backend server (`cargo run` in `backend/`)
- **Integration Tests**: Backend + external APIs (CoinGecko, Yahoo Finance, etc.)
- **Utility Scripts**: MongoDB

## Running All Tests

Create a test runner script:

```bash
#!/bin/bash
# tests/run_all.sh

echo "🧪 Running All Tests"
echo "===================="

# API Tests
echo "Running API tests..."
for test in tests/api/*.sh; do
    echo "Running $(basename $test)..."
    bash "$test" || echo "❌ Failed: $(basename $test)"
done

# Integration Tests
echo "Running integration tests..."
for test in tests/integration/*.sh; do
    echo "Running $(basename $test)..."
    bash "$test" || echo "❌ Failed: $(basename $test)"
done

echo "✅ All tests complete"
```

## Test Output

Tests output results to stdout with:

- ✅ Success markers
- ❌ Failure markers
- Detailed JSON responses (when applicable)

## Debugging Tests

Enable verbose output:

```bash
bash -x tests/api/test_exercise_types.sh
```

Check backend logs:

```bash
# Backend logs show detailed request/response info
cd backend && RUST_LOG=debug cargo run
```

## Adding New Tests

1. Create a new `.sh` file in the appropriate directory
2. Use environment variables for configuration (never hardcode secrets)
3. Add descriptive echo statements for test steps
4. Use consistent success/failure markers (✅/❌)
5. Update this README with the new test

### Test Template

```bash
#!/bin/bash

# Test Description
# Prerequisites: Backend running on localhost:3001

API_KEY="${WYAT_API_KEY:-your-test-api-key-here}"
BASE_URL="http://localhost:3001"

echo "🧪 Testing Feature X"
echo "===================="

# Test 1
echo "Test 1: Description..."
RESPONSE=$(curl -s -X GET "$BASE_URL/endpoint" \
  -H "x-wyat-api-key: $API_KEY")

if echo "$RESPONSE" | grep -q "expected_value"; then
    echo "✅ Test 1 passed"
else
    echo "❌ Test 1 failed"
    echo "$RESPONSE"
fi

echo "Done!"
```

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    export WYAT_API_KEY=${{ secrets.WYAT_API_KEY }}
    cd backend && cargo run &
    sleep 5
    cd ../tests/api && ./test_exercise_types.sh
```

## Troubleshooting

### "Connection refused"

- Ensure backend is running: `cd backend && cargo run`
- Check port: Backend should be on port 3001

### "Authentication failed"

- Set `WYAT_API_KEY` environment variable
- Ensure it matches the backend's `WYAT_API_KEY`

### "Database error"

- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URI` environment variable

### External API errors

- Check API keys are set correctly
- Verify API service is not down
- Check rate limits

## Related Documentation

- [SECURITY.md](../SECURITY.md) - Environment variable setup
- [DEBUG_LOGGING_GUIDE.md](../DEBUG_LOGGING_GUIDE.md) - Debugging guide
- [COINGECKO_MODULARIZATION.md](../COINGECKO_MODULARIZATION.md) - CoinGecko integration
- [PLAID_INTEGRATION_GUIDE.md](../PLAID_INTEGRATION_GUIDE.md) - Plaid integration
