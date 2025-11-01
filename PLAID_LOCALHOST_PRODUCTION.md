# Using Production Plaid on Localhost

## Quick Answer

**No, you do NOT need to deploy to use production Plaid credentials.** You can use production Plaid API keys from your localhost development environment.

## How It Works

### Your Current Setup (Localhost)

```
Frontend: http://localhost:3000
Backend: http://localhost:3001
Plaid API: https://production.plaid.com (in the cloud)
```

Your localhost backend makes API calls to Plaid's production servers. This is perfectly fine and supported by Plaid.

## What You Can Do on Localhost

✅ **Connect real bank accounts**
✅ **Fetch live transaction data**
✅ **Test with actual financial data**
✅ **Full production API access**
✅ **All Plaid features**

## Configuration

### Required Environment Variables

```bash
# Backend environment
PLAID_CLIENT_ID=685f2adf1a6ea300253174a3  # Your production client ID
PLAID_SECRET=d0f12584cd08659fb802530b0a7d46  # Your production secret
PLAID_ENV=prod  # Use production environment
```

### Optional Environment Variables

```bash
# Only needed if you encounter OAuth redirect issues
PLAID_REDIRECT_URI=http://localhost:3000/services/plaid
```

## Plaid Dashboard Configuration

### 1. Add Localhost to Allowed Origins

In your [Plaid Dashboard](https://dashboard.plaid.com/):

1. Go to **Team Settings** → **API**
2. Under **Allowed redirect URIs**, add:
   ```
   http://localhost:3000/*
   ```
3. Under **Allowed origins** (for CORS), add:
   ```
   http://localhost:3000
   http://localhost:3001
   ```

### 2. Verify Production Access

- Ensure your Plaid account is approved for Production
- Check that you have the `transactions` product enabled
- Verify your account is not rate-limited

## Testing Flow

### Step 1: Start Your Services

```bash
# Terminal 1: Start backend
cd backend
cargo run

# Terminal 2: Start frontend
cd frontend
npm run dev
```

### Step 2: Connect a Bank

1. Open `http://localhost:3000/services/plaid`
2. Click **"Connect Bank"**
3. Select your actual bank (not test credentials)
4. Complete the authentication flow
5. Your bank connection is now stored

### Step 3: Sync Transactions

1. Select the connected bank from the dropdown
2. Enter your internal account ID (e.g., `acct.chase_checking`)
3. Choose a date range
4. Click **"Sync Transactions"**
5. Transactions are imported into your local MongoDB

## Common Issues and Solutions

### Issue: "Invalid redirect_uri"

**Solution:** Add `http://localhost:3000/*` to your Plaid Dashboard's allowed redirect URIs.

Alternatively, set the environment variable:

```bash
PLAID_REDIRECT_URI=http://localhost:3000/services/plaid
```

### Issue: "unauthorized_client"

**Causes:**

- Your Plaid account isn't approved for Production
- You're using Sandbox credentials with `PLAID_ENV=prod`
- Your client ID or secret is incorrect

**Solution:** Verify your credentials and Plaid account status.

### Issue: CORS errors in browser

**Solution:** Add `http://localhost:3000` to allowed origins in Plaid Dashboard.

### Issue: "Institution not available"

**Cause:** Some banks are only available in Production, not Sandbox.

**Solution:** This is expected. Use your actual bank credentials in Production mode.

## When to Deploy

You should deploy to a production environment when:

1. **You want to share access** with other users
2. **You need a stable URL** for webhooks or OAuth callbacks
3. **You want 24/7 availability** (not just when your laptop is on)
4. **You need better security** (HTTPS, secure environment variables)
5. **You want to scale** beyond local development

## Deployment Checklist

When you do decide to deploy:

### Environment Variables

Update these for your production environment:

```bash
# Production backend
PLAID_CLIENT_ID=685f2adf1a6ea300253174a3
PLAID_SECRET=d0f12584cd08659fb802530b0a7d46
PLAID_ENV=prod
PLAID_REDIRECT_URI=https://yourdomain.com/services/plaid  # Your actual domain
MONGODB_URI=mongodb+srv://...  # Your production MongoDB
```

### Plaid Dashboard

Add your production domain to allowed URIs:

```
https://yourdomain.com/*
```

### Security Considerations

- [ ] Use HTTPS (required for production)
- [ ] Secure your MongoDB connection
- [ ] Use environment variables (never commit secrets)
- [ ] Enable proper authentication/authorization
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Implement proper error handling

## Advantages of Testing on Localhost

### ✅ Faster Development

- No deployment delays
- Instant code changes
- Easy debugging with local tools

### ✅ Cost Savings

- No hosting costs during development
- No need for production infrastructure yet
- Can test thoroughly before deploying

### ✅ Privacy

- Your data stays on your local machine
- No exposure to the internet
- Full control over your environment

### ✅ Flexibility

- Easy to reset and test again
- Can test with real data safely
- No impact on production users

## Limitations of Localhost

### ⚠️ Not Accessible to Others

- Only you can access it
- Can't share with team members
- No public URL

### ⚠️ Requires Your Computer

- Only works when your laptop is on
- No 24/7 availability
- Can't use from other devices

### ⚠️ No Webhooks

- Plaid webhooks need a public URL
- Can't receive real-time updates
- Must manually trigger syncs

### ⚠️ HTTP Only

- Localhost uses HTTP, not HTTPS
- Some banks may require HTTPS
- Less secure than production

## Recommended Workflow

### Phase 1: Localhost Development (Now)

1. Use production Plaid credentials on localhost
2. Connect your real bank account
3. Test transaction syncing
4. Verify data accuracy
5. Test all features thoroughly

### Phase 2: Staging Deployment (Optional)

1. Deploy to a staging environment
2. Use production Plaid credentials
3. Test with HTTPS
4. Verify OAuth flows work correctly
5. Test webhooks if needed

### Phase 3: Production Deployment (When Ready)

1. Deploy to production environment
2. Use production Plaid credentials
3. Update Plaid Dashboard with production URLs
4. Enable monitoring and logging
5. Go live!

## Summary

**You can absolutely use production Plaid on localhost.** This is the recommended way to develop and test your integration before deploying. The only time you need to deploy is when you want to:

- Share access with others
- Have 24/7 availability
- Use webhooks
- Ensure HTTPS security

For now, keep developing on localhost with your production credentials. Deploy when you're ready to go live or need the features that require a public URL.

## Next Steps

1. ✅ You already have production credentials configured
2. ✅ Your backend is set up to use `PLAID_ENV=prod`
3. 🔄 Add `http://localhost:3000/*` to Plaid Dashboard (if not already done)
4. 🔄 Restart your backend to pick up environment changes
5. 🔄 Test connecting a real bank account
6. 🔄 Sync transactions and verify they appear in your ledger

You're all set to use production Plaid on localhost! 🎉
