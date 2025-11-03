# Quick Setup Guide

## Backend Environment Setup

1. **Create `.env` file in backend directory:**

```bash
cd backend
cp env.example .env
```

2. **Edit `backend/.env` with your actual values:**

```bash
# Required
MONGODB_URI=mongodb://localhost:27017
WYAT_API_KEY=your-secure-random-key-here

# OpenAI (if using AI features)
OPENAI_API_SECRET=sk-your-openai-key-here

# CoinGecko (for crypto prices)
COINGECKO_API_URL=https://api.coingecko.com/api/v3/simple/price

# If you have a CoinGecko API key (optional):
# COINGECKO_API_KEY=CG-your-key-here
# COINGECKO_API_KEY_HEADER=x-cg-demo-api-key

# Yahoo Finance (no key needed)
YAHOO_FINANCE_API_URL=https://query1.finance.yahoo.com/v8/finance/chart

# Plaid (if using bank integration)
# PLAID_CLIENT_ID=your-plaid-client-id
# PLAID_SECRET=your-plaid-secret
# PLAID_ENV=sandbox
```

3. **Generate a secure API key:**

```bash
# Using openssl
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Frontend Environment Setup

1. **Create `.env.local` file in frontend directory:**

```bash
cd frontend
cp env.local.example .env.local
```

2. **Edit `frontend/.env.local`:**

```bash
# Must match backend WYAT_API_KEY
NEXT_PUBLIC_WYAT_API_KEY=same-key-as-backend

# API URLs
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_FRONTEND_ORIGIN=http://localhost:3000
```

## CoinGecko API Configuration

### Default: Public API (No Key Required) ✅ Recommended

```bash
# backend/.env
COINGECKO_API_URL=https://api.coingecko.com/api/v3/simple/price
```

**That's it!** Don't add `COINGECKO_API_KEY` or `COINGECKO_API_KEY_HEADER`. The public API works great for development and testing.

**Rate Limits:** 10-50 calls/minute (sufficient for most personal use)

### Only If You Need Higher Limits

#### Option A: Demo Tier (Free with Registration)

Get a free API key at https://www.coingecko.com/en/api

```bash
# backend/.env
COINGECKO_API_URL=https://api.coingecko.com/api/v3/simple/price
COINGECKO_API_KEY=CG-your-demo-key-here
COINGECKO_API_KEY_HEADER=x-cg-demo-api-key
```

#### Option B: Pro Tier (Paid)

For production use with high traffic

```bash
# backend/.env
COINGECKO_API_URL=https://pro-api.coingecko.com/api/v3/simple/price
COINGECKO_API_KEY=CG-your-pro-key-here
COINGECKO_API_KEY_HEADER=x-cg-pro-api-key
```

## Testing Without API Key

If you're getting 400 errors, try running **without** a CoinGecko API key:

1. **Remove or comment out these lines in `backend/.env`:**

```bash
# COINGECKO_API_KEY=...
# COINGECKO_API_KEY_HEADER=...
```

2. **Restart the backend:**

```bash
cd backend
cargo run
```

3. **Test:**

```bash
cd tests/integration
./test_coingecko_simple_price.sh
```

## Common Issues

### "400 Bad Request" from CoinGecko

- **Cause**: Wrong API key header for your tier
- **Fix**: Remove API key settings to use public API, or use correct header:
  - Demo tier: `x-cg-demo-api-key`
  - Pro tier: `x-cg-pro-api-key`

### "missing config: COINGECKO_API_URL"

- **Cause**: `.env` file not created
- **Fix**: Copy `env.example` to `.env` and fill in values

### "Connection refused"

- **Cause**: Backend not running
- **Fix**: Start backend with `cd backend && cargo run`

### "Authentication failed"

- **Cause**: `WYAT_API_KEY` mismatch between frontend and backend
- **Fix**: Ensure both `.env` files have the same key

## Verification

Test your setup:

```bash
# 1. Check backend starts
cd backend
cargo run
# Should see: "Server running on http://0.0.0.0:3001"

# 2. Check CoinGecko (in another terminal)
cd tests/integration
./test_coingecko_simple_price.sh
# Should see: ✅ SUCCESS

# 3. Check frontend (in another terminal)
cd frontend
npm run dev
# Should see: "Ready on http://localhost:3000"

# 4. Try adding crypto to watchlist
# Open http://localhost:3000/capital/data
# Add: symbol=bitcoin, name=Bitcoin
```

## Next Steps

Once setup is complete:

1. See `tests/README.md` for running tests
2. See `DEBUG_LOGGING_GUIDE.md` for debugging
3. See `SECURITY.md` for security best practices
