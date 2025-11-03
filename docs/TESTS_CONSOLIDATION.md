# Test Scripts Consolidation

## Summary

All test scripts have been consolidated into a single `tests/` directory at the project root for better organization and discoverability.

## New Structure

```
tests/
├── api/                      # Backend API endpoint tests (8 scripts)
│   ├── test_enhanced_search.sh
│   ├── test_exercise_types.sh
│   ├── test_get_entries_by_day.sh
│   ├── test_journal_search.sh
│   ├── test_meta_crud.sh
│   ├── test_meta_endpoints.sh
│   ├── test_meta_patch.sh
│   └── test_oura_endpoints.sh
│
├── integration/              # Integration & feature tests (11 scripts)
│   ├── test_account_creation.sh
│   ├── test_coingecko_modular.sh
│   ├── test_coingecko_ping.sh
│   ├── test_coingecko_simple_price.sh
│   ├── test_extract_endpoint.sh
│   ├── test_get_transaction_by_id.sh
│   ├── test_pdf_extraction.sh
│   ├── test_plaid_integration.sh
│   ├── test_prompt_endpoint.sh
│   ├── test_transactions_api.sh
│   └── test_yahoo_finance.sh
│
├── utils/                    # Utility scripts (1 script)
│   └── check_accounts.sh
│
├── run_all.sh               # Master test runner
└── README.md                # Test documentation
```

## Changes Made

### Moved From Root Directory

All `test_*.sh` files from the project root have been moved to `tests/integration/`:

- `test_account_creation.sh`
- `test_coingecko_modular.sh`
- `test_coingecko_ping.sh`
- `test_coingecko_simple_price.sh`
- `test_get_transaction_by_id.sh`
- `test_pdf_extraction.sh`
- `test_plaid_integration.sh`
- `test_prompt_endpoint.sh`
- `test_transactions_api.sh`
- `test_yahoo_finance.sh`

### Moved From backend/tests/

All test scripts from `backend/tests/` have been moved to `tests/api/`:

- `test_enhanced_search.sh`
- `test_exercise_types.sh`
- `test_get_entries_by_day.sh`
- `test_journal_search.sh`
- `test_meta_crud.sh`
- `test_meta_endpoints.sh`
- `test_meta_patch.sh`
- `test_oura_endpoints.sh`

### Moved From backend/scripts/

Test-related scripts from `backend/scripts/` have been moved to `tests/integration/`:

- `test_extract_endpoint.sh`

### Moved Utility Scripts

Utility scripts have been moved to `tests/utils/`:

- `check_accounts.sh` (from root)

### Kept in Place

Non-test scripts remain in their original locations:

- `backend/scripts/backup_journal.sh` (utility, not a test)

## Benefits

1. **Better Organization**: All tests in one place
2. **Clear Categorization**: API tests vs integration tests vs utilities
3. **Easier Discovery**: New developers can find all tests quickly
4. **Consistent Structure**: Follows common project conventions
5. **Simplified CI/CD**: Single directory to scan for tests

## Running Tests

### Run All Tests

```bash
cd tests
./run_all.sh
```

### Run Specific Category

```bash
# API tests only
cd tests/api
./test_exercise_types.sh

# Integration tests only
cd tests/integration
./test_coingecko_ping.sh

# Utility scripts
cd tests/utils
./check_accounts.sh
```

### Prerequisites

Set required environment variables:

```bash
export WYAT_API_KEY=your-api-key
export MONGODB_URI=mongodb://localhost:27017
# ... other variables as needed
```

Start the backend:

```bash
cd backend
cargo run
```

## Documentation

See `tests/README.md` for:

- Detailed description of each test
- Prerequisites and setup
- Running instructions
- Troubleshooting guide
- Adding new tests

## Migration Notes

If you have scripts or CI/CD pipelines that reference the old test locations, update them:

**Old:**

```bash
./test_coingecko_ping.sh
./backend/tests/test_exercise_types.sh
```

**New:**

```bash
./tests/integration/test_coingecko_ping.sh
./tests/api/test_exercise_types.sh
```

## Security

All test scripts now use environment variables for API keys:

```bash
API_KEY="${WYAT_API_KEY:-your-test-api-key-here}"
```

**Never hardcode API keys in test scripts.** See `SECURITY.md` for details.

## Future Improvements

Potential enhancements:

1. Add unit tests (Rust `#[test]` functions)
2. Add frontend tests (Jest/Vitest)
3. Add performance benchmarks
4. Integrate with GitHub Actions
5. Add test coverage reporting
6. Create test fixtures/mocks
7. Add load testing scripts

## Related Documentation

- [tests/README.md](tests/README.md) - Detailed test documentation
- [SECURITY.md](SECURITY.md) - Environment variable setup
- [DEBUG_LOGGING_GUIDE.md](DEBUG_LOGGING_GUIDE.md) - Debugging guide
