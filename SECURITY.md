# Security Guidelines

## ⚠️ IMPORTANT: Never Commit Secrets

This repository is designed to be publicly shared. **NEVER** commit sensitive information including:

- API keys
- Passwords
- Database credentials
- OAuth secrets
- Private keys
- Access tokens

## Environment Variables

All sensitive configuration is managed through environment variables.

### Backend Configuration

1. Copy the example file:

   ```bash
   cd backend
   cp env.example .env
   ```

2. Edit `.env` and add your actual credentials:

   ```bash
   # Required
   MONGODB_URI=mongodb://localhost:27017
   OPENAI_API_SECRET=sk-your-actual-key
   WYAT_API_KEY=your-secure-random-key

   # Optional
   COINGECKO_API_KEY=your-coingecko-key
   PLAID_CLIENT_ID=your-plaid-id
   PLAID_SECRET=your-plaid-secret
   ```

3. The `.env` file is already in `.gitignore` and will never be committed.

### Frontend Configuration

1. Copy the example file:

   ```bash
   cd frontend
   cp env.local.example .env.local
   ```

2. Edit `.env.local` and add your actual values:

   ```bash
   NEXT_PUBLIC_WYAT_API_KEY=same-as-backend-wyat-api-key
   ```

3. The `.env.local` file is already in `.gitignore` and will never be committed.

## Test Scripts

All test scripts in `backend/tests/` use environment variables:

```bash
# Set your API key before running tests
export WYAT_API_KEY=your-test-api-key

# Run tests
./backend/tests/test_exercise_types.sh
```

**Never hardcode API keys in test scripts.**

## API Key Generation

Generate secure random API keys:

```bash
# Using openssl (recommended)
openssl rand -hex 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## Checking for Leaked Secrets

Before committing, always check for accidentally committed secrets:

```bash
# Search for common API key patterns
git grep -i "api_key\|secret\|password\|token" | grep -v ".example\|.md"

# Search for specific key formats
git grep -E "sk-[A-Za-z0-9]{20,}|CG-[A-Za-z0-9\-]{30,}"
```

## What's Safe to Commit

✅ **Safe to commit:**

- Example environment files (`env.example`, `env.local.example`)
- Documentation mentioning environment variable names
- Code that reads from environment variables
- Test scripts that use `${ENV_VAR:-default}` syntax

❌ **Never commit:**

- Actual `.env` or `.env.local` files
- Hardcoded API keys or secrets
- Database connection strings with credentials
- Private keys or certificates

## Git History Cleanup

If you accidentally committed a secret:

1. **Immediately rotate the secret** (generate a new one and update your services)
2. Remove it from git history:

   ```bash
   # Using git filter-repo (recommended)
   git filter-repo --invert-paths --path path/to/file-with-secret

   # Or using BFG Repo-Cleaner
   bfg --replace-text passwords.txt
   ```

3. Force push (⚠️ coordinate with team):
   ```bash
   git push --force-with-lease
   ```

## Security Best Practices

1. **Use different keys for development and production**
2. **Rotate keys regularly** (every 90 days recommended)
3. **Use read-only keys when possible** (e.g., for monitoring)
4. **Enable 2FA** on all service accounts
5. **Monitor API usage** for unusual patterns
6. **Use secrets management** for production (AWS Secrets Manager, HashiCorp Vault, etc.)

## Reporting Security Issues

If you discover a security vulnerability, please email: [your-security-email]

**Do not** create public GitHub issues for security vulnerabilities.

## Third-Party Services

This project integrates with:

- **OpenAI** - Requires API key (paid)
- **CoinGecko** - Optional API key (free tier available)
- **Yahoo Finance** - No API key required (public API)
- **Plaid** - Requires client ID and secret (free sandbox)
- **Oura** - Optional API token (requires Oura account)

Always review the terms of service and rate limits for each service.

## License

When sharing this code publicly, ensure all secrets are removed and proper attribution is maintained.
