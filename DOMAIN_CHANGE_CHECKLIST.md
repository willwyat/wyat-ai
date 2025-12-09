# Domain Change Checklist: Vercel → app.wyat.ai

**Date:** December 9, 2025  
**Status:** 🔄 IN PROGRESS

---

## Overview

Frontend domain changed from `https://wyat-ai.vercel.app/` to `https://app.wyat.ai`.  
This checklist ensures all CORS and configuration issues are resolved.

---

## Critical Changes Required

### 1. Backend Environment Variables

**File:** `backend/.env`

```bash
# OLD
FRONTEND_ORIGIN=https://wyat-ai.vercel.app

# NEW
FRONTEND_ORIGIN=https://app.wyat.ai
```

**Action Required:**

- [ ] Update `FRONTEND_ORIGIN` in production backend `.env`
- [ ] Restart backend service
- [ ] Verify environment variable loaded: `echo $FRONTEND_ORIGIN`

### 2. Frontend Environment Variables

**File:** `frontend/.env.local` or Vercel Environment Variables

```bash
# Verify these are correct
NEXT_PUBLIC_API_URL=https://api.wyat.ai
NEXT_PUBLIC_FRONTEND_ORIGIN=https://app.wyat.ai
NEXT_PUBLIC_WYAT_API_KEY=<your-api-key>
```

**Action Required:**

- [ ] Update Vercel environment variables (if using Vercel)
- [ ] Redeploy frontend to apply new environment variables
- [ ] Clear browser cache after deployment

---

## CORS Configuration Locations

### Backend Files to Verify

1. **Main CORS Layer**

   - File: `backend/src/main.rs` (line 824)
   - Uses: `FRONTEND_ORIGIN` environment variable
   - Status: ✅ Already configured correctly

2. **Storage HTTP Service**

   - File: `backend/src/services/storage_http.rs` (line 140)
   - Uses: `FRONTEND_ORIGIN` environment variable
   - Status: ✅ Already configured correctly

3. **Oura OAuth Redirects**
   - File: `backend/src/services/oura.rs` (multiple locations)
   - Uses: `FRONTEND_ORIGIN` environment variable
   - Status: ✅ Already configured correctly

**No code changes required** - All CORS configuration uses the `FRONTEND_ORIGIN` environment variable.

---

## Testing Checklist

### Pre-Deployment Tests

- [ ] Backend `.env` updated with new domain
- [ ] Backend service restarted
- [ ] Frontend environment variables updated in Vercel
- [ ] Frontend redeployed

### Post-Deployment Tests

#### Browser Tests

- [ ] Visit https://app.wyat.ai
- [ ] Open browser DevTools → Console
- [ ] Check for CORS errors (should be none)
- [ ] Test homepage loads

#### API Endpoint Tests

- [ ] Journal page loads (GET /journal/mongo/all)
- [ ] Capital page loads (GET /capital/accounts)
- [ ] Projects/Todo page loads (GET /projects)
- [ ] Documents page loads (GET /documents)
- [ ] Vitals page loads (GET /vitals/\*)

#### Authentication Tests

- [ ] Passcode prompt appears on first visit
- [ ] Passcode persists after entry (localStorage/cookies)
- [ ] API requests include `x-wyat-api-key` header

#### Feature Tests

- [ ] Create new journal entry
- [ ] Upload document
- [ ] View project details
- [ ] Check capital accounts
- [ ] Plaid OAuth flow (if applicable)
- [ ] Oura OAuth flow (if applicable)

### Cross-Browser Tests

- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (macOS)
- [ ] Safari (iOS)
- [ ] Chrome (Android)

---

## Common Issues & Solutions

### Issue 1: CORS Error After Domain Change

**Symptom:**

```
Access to fetch at 'https://api.wyat.ai/...' from origin 'https://app.wyat.ai'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
```

**Solution:**

1. Check backend logs: `tail -f /var/log/wyat-backend.log`
2. Verify `FRONTEND_ORIGIN` environment variable:
   ```bash
   echo $FRONTEND_ORIGIN
   # Should output: https://app.wyat.ai
   ```
3. If incorrect, update and restart:

   ```bash
   # Edit .env file
   nano /path/to/backend/.env

   # Restart service
   sudo systemctl restart wyat-backend
   ```

### Issue 2: Environment Variables Not Applied

**Symptom:**
Frontend still using old domain or localhost URLs

**Solution:**

1. In Vercel Dashboard:

   - Go to Project Settings → Environment Variables
   - Verify `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_FRONTEND_ORIGIN`
   - Trigger new deployment after changes

2. Clear browser cache:
   - Chrome: Ctrl+Shift+Delete → Clear cached images and files
   - Or use Incognito/Private mode for testing

### Issue 3: OAuth Redirects Failing

**Symptom:**
Plaid or Oura OAuth returns to wrong domain

**Solution:**

1. Update OAuth redirect URLs in provider dashboards:

   - Plaid: https://dashboard.plaid.com → API → Allowed redirect URIs
   - Oura: https://cloud.ouraring.com → Applications → Redirect URIs

2. Add `https://app.wyat.ai/oauth-callback` or similar

### Issue 4: Passcode Not Persisting

**Symptom:**
Users logged out after closing app (iOS PWA)

**Solution:**
Already fixed with triple-redundant storage (localStorage + sessionStorage + cookies).
No action required.

---

## Rollback Plan

If critical issues occur:

### 1. Immediate Rollback (Backend)

```bash
# Revert to old domain
cd /path/to/backend
nano .env
# Change: FRONTEND_ORIGIN=https://wyat-ai.vercel.app
sudo systemctl restart wyat-backend
```

### 2. Immediate Rollback (Frontend)

In Vercel Dashboard:

1. Go to Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

### 3. DNS Rollback

If DNS is the issue:

1. Check DNS propagation: https://dnschecker.org
2. Verify A/CNAME records point to correct servers
3. Wait for DNS propagation (up to 48 hours)

---

## Monitoring

### What to Monitor

1. **Error Rates**

   - Check backend logs for 403/CORS errors
   - Monitor Vercel analytics for client errors

2. **User Reports**

   - "Can't access the app"
   - "Logged out unexpectedly"
   - "Page won't load"

3. **API Response Times**
   - Should remain consistent
   - Increase may indicate DNS issues

### Monitoring Commands

```bash
# Backend logs (CORS errors)
tail -f /var/log/wyat-backend.log | grep -i cors

# Backend logs (all errors)
tail -f /var/log/wyat-backend.log | grep -i error

# Check if backend is running
systemctl status wyat-backend

# Check environment variables
sudo systemctl show wyat-backend --property=Environment
```

---

## DNS Configuration

### Verify DNS Records

```bash
# Check A record
dig app.wyat.ai A

# Check CNAME record
dig app.wyat.ai CNAME

# Check DNS propagation
# Visit: https://dnschecker.org
```

### Expected Configuration

```
app.wyat.ai     A       <IP-address>
# OR
app.wyat.ai     CNAME   cname.vercel-dns.com
```

---

## Security Considerations

### 1. Update CORS to Single Origin

**Current:** Backend allows only `FRONTEND_ORIGIN`

**Good:** Prevents unauthorized domains from accessing API

**Action:** No changes needed - already secure

### 2. HTTPS Enforcement

**Critical:** Ensure both domains use HTTPS

```bash
# Production (Correct)
FRONTEND_ORIGIN=https://app.wyat.ai

# Production (Incorrect - missing https)
FRONTEND_ORIGIN=http://app.wyat.ai
```

### 3. API Key Rotation

**Optional:** Consider rotating `WYAT_API_KEY` after domain change

```bash
# Generate new key
openssl rand -base64 32

# Update in both backend and frontend .env
# Redeploy both services
```

---

## Timeline

### Immediate (0-1 hour)

- [x] Update backend `FRONTEND_ORIGIN`
- [x] Restart backend service
- [ ] Update frontend environment variables
- [ ] Redeploy frontend
- [ ] Test basic functionality

### Short-term (1-24 hours)

- [ ] Monitor for CORS errors
- [ ] Test all major features
- [ ] Verify OAuth flows
- [ ] Test on multiple browsers
- [ ] Test on mobile devices

### Long-term (1-7 days)

- [ ] Monitor error rates
- [ ] Gather user feedback
- [ ] Check analytics for issues
- [ ] Verify DNS propagation complete
- [ ] Update documentation with new domain

---

## Success Criteria

✅ Domain change successful when:

1. No CORS errors in browser console
2. All API endpoints respond correctly
3. Authentication persists across sessions
4. OAuth flows work (Plaid, Oura)
5. No increase in error rates
6. Users can access all features
7. Mobile PWA works correctly
8. DNS fully propagated

---

## Documentation Updates

After successful migration:

- [ ] Update README.md with new domain
- [ ] Update SETUP_GUIDE.md
- [ ] Update API documentation
- [ ] Update deployment guides
- [ ] Archive old Vercel domain references

---

## Contact & Support

If issues persist:

1. Check backend logs: `/var/log/wyat-backend.log`
2. Check Vercel deployment logs
3. Test with curl to isolate issues
4. Review CORS_CONFIGURATION.md for detailed guide

---

**Status:** 🔄 Awaiting deployment verification

Once all tests pass, mark as: ✅ COMPLETE
