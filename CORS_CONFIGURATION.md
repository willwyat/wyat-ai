# CORS Configuration Guide

**Date:** December 9, 2025  
**Status:** ✅ CONFIGURED

---

## Overview

This guide explains the CORS (Cross-Origin Resource Sharing) configuration for Wyat AI, especially important after changing the frontend domain from `https://wyat-ai.vercel.app/` to `https://app.wyat.ai`.

---

## CORS Architecture

### Backend (Rust/Axum)

The backend uses `tower_http::cors::CorsLayer` to handle CORS:

```rust
let origin = std::env::var("FRONTEND_ORIGIN")
    .unwrap_or_else(|_| "http://localhost:3000".to_string());

let cors = CorsLayer::new()
    .allow_origin(origin.parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH])
    .allow_headers([
        HeaderName::from_static("content-type"),
        HeaderName::from_static("x-wyat-api-key"),
    ]);
```

**Location:** `backend/src/main.rs` (lines 824-835)

### Frontend (Next.js)

The frontend uses environment variables to configure API endpoints:

```typescript
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const FRONTEND_ORIGIN =
  process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "http://localhost:3000";
```

**Location:** `frontend/src/lib/config.ts`

---

## Environment Variables

### Backend Environment Variables

**File:** `backend/.env`

```bash
# CORS Configuration
# CRITICAL: Must match your frontend domain exactly
FRONTEND_ORIGIN=https://app.wyat.ai

# Other variables
MONGODB_URI=mongodb+srv://...
WYAT_API_KEY=your-secure-api-key
PORT=3001
```

### Frontend Environment Variables

**File:** `frontend/.env.local`

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.wyat.ai
NEXT_PUBLIC_FRONTEND_ORIGIN=https://app.wyat.ai

# Wyat API Key (must match backend)
NEXT_PUBLIC_WYAT_API_KEY=your-secure-api-key
```

---

## Domain Configuration Matrix

| Environment          | Frontend Domain            | Backend Domain        | FRONTEND_ORIGIN            | NEXT_PUBLIC_API_URL   |
| -------------------- | -------------------------- | --------------------- | -------------------------- | --------------------- |
| **Local Dev**        | http://localhost:3000      | http://localhost:3001 | http://localhost:3000      | http://localhost:3001 |
| **Vercel (Old)**     | https://wyat-ai.vercel.app | https://api.wyat.ai   | https://wyat-ai.vercel.app | https://api.wyat.ai   |
| **Production (New)** | https://app.wyat.ai        | https://api.wyat.ai   | https://app.wyat.ai        | https://api.wyat.ai   |

---

## CORS Configuration Locations

### 1. Main CORS Layer (Primary)

**File:** `backend/src/main.rs` (line 824)

```rust
let origin = std::env::var("FRONTEND_ORIGIN")
    .unwrap_or_else(|_| "http://localhost:3000".to_string());

let cors = CorsLayer::new()
    .allow_origin(origin.parse::<HeaderValue>().unwrap())
    .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::PATCH])
    .allow_headers([
        HeaderName::from_static("content-type"),
        HeaderName::from_static("x-wyat-api-key"),
    ]);
```

**Applies to:** All API routes

### 2. Storage HTTP Service

**File:** `backend/src/services/storage_http.rs` (line 140)

```rust
(
    header::ACCESS_CONTROL_ALLOW_ORIGIN,
    std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "*".to_string()),
)
```

**Applies to:** Document blob retrieval endpoints

### 3. Oura OAuth Redirects

**File:** `backend/src/services/oura.rs` (multiple locations)

```rust
let frontend_url = env::var("FRONTEND_ORIGIN")
    .unwrap_or_else(|_| "http://localhost:3000".to_string());
```

**Applies to:** OAuth callback redirects after Oura authentication

---

## Common CORS Issues & Solutions

### Issue 1: Frontend Domain Changed

**Symptom:**

```
Access to fetch at 'https://api.wyat.ai/...' from origin 'https://app.wyat.ai'
has been blocked by CORS policy
```

**Solution:**
Update backend `FRONTEND_ORIGIN` environment variable:

```bash
# Backend .env
FRONTEND_ORIGIN=https://app.wyat.ai
```

### Issue 2: Protocol Mismatch

**Symptom:**

```
CORS error: Origin https://app.wyat.ai does not match http://app.wyat.ai
```

**Solution:**
Ensure protocol (http/https) matches exactly:

```bash
# Correct
FRONTEND_ORIGIN=https://app.wyat.ai

# Incorrect (missing https)
FRONTEND_ORIGIN=app.wyat.ai
```

### Issue 3: Trailing Slash

**Symptom:**
Intermittent CORS errors

**Solution:**
Do NOT include trailing slash:

```bash
# Correct
FRONTEND_ORIGIN=https://app.wyat.ai

# Incorrect (has trailing slash)
FRONTEND_ORIGIN=https://app.wyat.ai/
```

### Issue 4: Multiple Subdomains

**Symptom:**
Need to allow multiple origins (e.g., app.wyat.ai and www.wyat.ai)

**Current Limitation:**
Backend only supports single origin.

**Workaround:**
Deploy separate backend instances or modify CORS layer to accept multiple origins:

```rust
let cors = CorsLayer::new()
    .allow_origin([
        "https://app.wyat.ai".parse::<HeaderValue>().unwrap(),
        "https://www.wyat.ai".parse::<HeaderValue>().unwrap(),
    ])
    .allow_methods([...])
    .allow_headers([...]);
```

---

## Allowed HTTP Methods

The backend allows the following HTTP methods:

- `GET` - Read operations
- `POST` - Create operations
- `PUT` - Update operations (replace entire resource)
- `PATCH` - Update operations (partial update)
- `DELETE` - Delete operations

**Location:** `backend/src/main.rs` (line 829)

---

## Allowed HTTP Headers

The backend allows the following request headers:

1. **`content-type`** - Required for JSON payloads
2. **`x-wyat-api-key`** - Custom authentication header

**Location:** `backend/src/main.rs` (lines 830-833)

**Note:** If you add new custom headers in the frontend, you must add them to the CORS configuration.

---

## Testing CORS Configuration

### 1. Browser DevTools

Open browser console and check for CORS errors:

```
✅ Good: No errors, requests succeed
❌ Bad: "blocked by CORS policy" errors
```

### 2. curl Test

Test CORS preflight from command line:

```bash
# Test OPTIONS preflight
curl -X OPTIONS https://api.wyat.ai/journal/mongo/all \
  -H "Origin: https://app.wyat.ai" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-wyat-api-key" \
  -v

# Should return:
# Access-Control-Allow-Origin: https://app.wyat.ai
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH
```

### 3. Frontend Test

Navigate to any page in the app and check if API calls succeed:

```typescript
// In browser console
fetch("https://api.wyat.ai/journal/mongo/all", {
  headers: {
    "x-wyat-api-key": "your-api-key",
  },
})
  .then((r) => r.json())
  .then((d) => console.log("✅ CORS working:", d))
  .catch((e) => console.error("❌ CORS error:", e));
```

---

## Deployment Checklist

### Backend Deployment

- [ ] Set `FRONTEND_ORIGIN` to `https://app.wyat.ai`
- [ ] Remove any hardcoded localhost URLs
- [ ] Restart backend service
- [ ] Verify environment variable is loaded

```bash
# Check environment variable
echo $FRONTEND_ORIGIN
# Should output: https://app.wyat.ai
```

### Frontend Deployment

- [ ] Set `NEXT_PUBLIC_API_URL` to `https://api.wyat.ai`
- [ ] Set `NEXT_PUBLIC_FRONTEND_ORIGIN` to `https://app.wyat.ai`
- [ ] Set `NEXT_PUBLIC_WYAT_API_KEY` to match backend
- [ ] Rebuild and redeploy frontend
- [ ] Clear browser cache

### Verification

- [ ] Test homepage loads
- [ ] Test journal page (requires API call)
- [ ] Test capital page (requires API call)
- [ ] Test projects/todo page (requires API call)
- [ ] Check browser console for CORS errors
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Test on mobile devices

---

## Security Considerations

### 1. Single Origin Only

**Current:** Backend allows only ONE origin at a time.

**Security Benefit:** Prevents unauthorized domains from accessing your API.

**Limitation:** Cannot easily support multiple domains (e.g., staging + production).

### 2. API Key Authentication

**Current:** Uses `x-wyat-api-key` header for authentication.

**Security Note:** This key is exposed in frontend code. Consider:

- Moving to backend-only authentication
- Implementing user-specific tokens
- Using OAuth/JWT for production

### 3. HTTPS in Production

**Critical:** Always use HTTPS in production.

```bash
# Production (Secure)
FRONTEND_ORIGIN=https://app.wyat.ai

# Development (OK for local only)
FRONTEND_ORIGIN=http://localhost:3000
```

---

## Troubleshooting

### Debug Mode

Enable CORS debug logging in backend:

```rust
// Add to main.rs
println!("CORS: Allowing origin: {}", origin);
```

### Check Response Headers

Use browser DevTools → Network tab → Response Headers:

```
Access-Control-Allow-Origin: https://app.wyat.ai
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH
Access-Control-Allow-Headers: content-type, x-wyat-api-key
```

### Common Errors

| Error                                     | Cause                           | Solution                                |
| ----------------------------------------- | ------------------------------- | --------------------------------------- |
| "No 'Access-Control-Allow-Origin' header" | FRONTEND_ORIGIN not set         | Set backend environment variable        |
| "Origin does not match"                   | Domain mismatch                 | Update FRONTEND_ORIGIN to match exactly |
| "Method not allowed"                      | HTTP method not in allow list   | Add method to CorsLayer                 |
| "Header not allowed"                      | Custom header not in allow list | Add header to CorsLayer                 |

---

## Migration Guide: Vercel to Custom Domain

### Old Configuration

```bash
# Backend .env (OLD)
FRONTEND_ORIGIN=https://wyat-ai.vercel.app
```

### New Configuration

```bash
# Backend .env (NEW)
FRONTEND_ORIGIN=https://app.wyat.ai
```

### Steps

1. **Update Backend Environment**

   ```bash
   cd backend
   # Edit .env file
   # Change: FRONTEND_ORIGIN=https://wyat-ai.vercel.app
   # To:     FRONTEND_ORIGIN=https://app.wyat.ai
   ```

2. **Restart Backend Service**

   ```bash
   # If using systemd
   sudo systemctl restart wyat-backend

   # If running manually
   pkill backend
   cargo run --release
   ```

3. **Update Frontend Environment**

   ```bash
   cd frontend
   # In Vercel dashboard or .env.local:
   # NEXT_PUBLIC_API_URL=https://api.wyat.ai
   # NEXT_PUBLIC_FRONTEND_ORIGIN=https://app.wyat.ai
   ```

4. **Redeploy Frontend**

   ```bash
   # Vercel will automatically redeploy on git push
   git push origin main

   # Or manually trigger in Vercel dashboard
   ```

5. **Test**
   - Visit https://app.wyat.ai
   - Open browser console
   - Check for CORS errors
   - Test all major features

---

## Files Reference

### Backend

- `backend/src/main.rs` - Main CORS configuration
- `backend/src/services/storage_http.rs` - Storage CORS headers
- `backend/src/services/oura.rs` - OAuth redirect URLs
- `backend/env.example` - Environment variable template

### Frontend

- `frontend/src/lib/config.ts` - API URL configuration
- `frontend/env.local.example` - Environment variable template

### Documentation

- `CORS_CONFIGURATION.md` - This file

---

## Support

If CORS issues persist:

1. Check backend logs for CORS-related errors
2. Verify environment variables are loaded correctly
3. Test with curl to isolate frontend vs backend issues
4. Check browser console for specific error messages
5. Ensure both frontend and backend are using latest code

---

**Configuration Complete** ✅

CORS is properly configured for the new domain `https://app.wyat.ai`.
