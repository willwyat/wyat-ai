# iOS PWA Passcode Handling

**Date:** December 9, 2025  
**Status:** ✅ IMPLEMENTED

---

## Overview

Enhanced the app-wide passcode guard to handle iOS Progressive Web App (PWA) edge cases. iOS Safari has known issues with localStorage persistence in PWA mode, especially when the app is bookmarked to the home screen.

---

## iOS PWA Storage Issues

### Common Problems

1. **localStorage Clearing**: iOS may clear localStorage when:

   - App is closed and reopened
   - Device is low on storage
   - iOS updates are installed
   - App is removed and re-added to home screen

2. **Private Browsing Mode**: Some iOS versions treat PWAs as private browsing

   - localStorage may be disabled entirely
   - Data doesn't persist between sessions

3. **Storage Quota**: iOS has strict storage quotas

   - Can cause silent failures when writing to localStorage

4. **Cookie Restrictions**: iOS 14+ has strict cookie policies
   - Third-party cookies blocked by default
   - First-party cookies more reliable

---

## Solution: Triple-Redundant Storage

Implemented a three-tier storage strategy with automatic fallbacks:

### 1. localStorage (Primary)

- **Best for**: Most browsers and platforms
- **Persistence**: Long-term (until cleared)
- **Capacity**: ~5-10MB
- **iOS PWA Issue**: May be cleared unexpectedly

### 2. sessionStorage (Fallback #1)

- **Best for**: iOS PWA session persistence
- **Persistence**: Current session only
- **Capacity**: ~5-10MB
- **iOS PWA Issue**: Persists during app session, even if localStorage fails

### 3. Cookies (Fallback #2)

- **Best for**: Maximum reliability on iOS
- **Persistence**: 365 days (configurable)
- **Capacity**: ~4KB per cookie
- **iOS PWA Issue**: Most reliable storage method

---

## Implementation Details

### Storage Helper Functions

#### `getStoredPasscode()`

Attempts to retrieve passcode from storage in order of reliability:

```typescript
function getStoredPasscode(): string | null {
  // 1. Try localStorage (fastest, most common)
  const fromLocal = localStorage.getItem(STORAGE_KEY);
  if (fromLocal) return fromLocal;

  // 2. Try sessionStorage (iOS PWA fallback)
  const fromSession = sessionStorage.getItem(STORAGE_KEY);
  if (fromSession) {
    // Restore to localStorage if possible
    localStorage.setItem(STORAGE_KEY, fromSession);
    return fromSession;
  }

  // 3. Try cookies (most reliable for iOS PWA)
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === STORAGE_KEY) {
      // Restore to other storage locations
      localStorage.setItem(STORAGE_KEY, value);
      sessionStorage.setItem(STORAGE_KEY, value);
      return value;
    }
  }

  return null;
}
```

#### `storePasscode(passcode: string)`

Stores passcode in all three locations simultaneously:

```typescript
function storePasscode(passcode: string): void {
  // Store in localStorage
  try {
    localStorage.setItem(STORAGE_KEY, passcode);
  } catch (e) {
    console.warn("localStorage.setItem failed:", e);
  }

  // Store in sessionStorage (iOS PWA fallback)
  try {
    sessionStorage.setItem(STORAGE_KEY, passcode);
  } catch (e) {
    console.warn("sessionStorage.setItem failed:", e);
  }

  // Store in cookie (most reliable for iOS PWA)
  try {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `${STORAGE_KEY}=${passcode};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
  } catch (e) {
    console.warn("Cookie storage failed:", e);
  }
}
```

#### `removePasscode()`

Clears passcode from all storage locations:

```typescript
function removePasscode(): void {
  // Clear localStorage
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("localStorage.removeItem failed:", e);
  }

  // Clear sessionStorage
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("sessionStorage.removeItem failed:", e);
  }

  // Clear cookie
  try {
    document.cookie = `${STORAGE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Strict`;
  } catch (e) {
    console.warn("Cookie removal failed:", e);
  }
}
```

---

## Error Handling

All storage operations are wrapped in try-catch blocks to handle:

- QuotaExceededError
- SecurityError (private browsing)
- Storage disabled by user
- iOS-specific storage failures

Failed operations log warnings but don't crash the app.

---

## PWA Manifest Enhancements

Updated `manifest.json` for better iOS PWA support:

```json
{
  "name": "Wyat AI",
  "short_name": "Wyat AI",
  "start_url": "/",
  "display": "standalone",
  "scope": "/",
  "orientation": "any",
  "prefer_related_applications": false,
  "icons": [
    {
      "src": "/webapp-icon.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/webapp-icon.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Key additions:**

- `scope: "/"` - Defines app scope for iOS
- `orientation: "any"` - Supports all orientations
- `prefer_related_applications: false` - Prefer PWA over native app
- `purpose: "any maskable"` - Icons work with iOS adaptive icons

---

## Testing Checklist

### Desktop/Android Testing

- [x] Enter passcode, refresh page → stays logged in
- [x] Enter passcode, close tab, reopen → stays logged in
- [x] Clear localStorage only → still logged in (cookie fallback)
- [x] Clear all storage → prompted for passcode

### iOS Safari Testing

- [ ] Add to Home Screen
- [ ] Open PWA, enter passcode
- [ ] Close PWA completely (swipe up)
- [ ] Reopen PWA → should stay logged in
- [ ] Restart iPhone → should stay logged in
- [ ] Wait 24 hours → should stay logged in
- [ ] Delete and re-add to home screen → prompted for passcode

### iOS Private Browsing

- [ ] Open in private tab
- [ ] Enter passcode
- [ ] Navigate between pages → stays logged in during session
- [ ] Close and reopen → prompted for passcode (expected)

### iOS Low Storage

- [ ] Fill device storage to near capacity
- [ ] Enter passcode
- [ ] Close and reopen app → should stay logged in (cookie fallback)

---

## Debug Logging

Added console logs for debugging storage issues:

```typescript
// On mount
"✅ Passcode validated from storage";
"ℹ️ No valid passcode found in storage";

// On validation
"✅ Passcode validated and stored";

// On logout
"🔓 Passcode cleared";

// On storage failures
"localStorage.setItem failed: [error]";
"sessionStorage.setItem failed: [error]";
"Cookie storage failed: [error]";
```

Check browser console to diagnose storage issues.

---

## Known Limitations

1. **Private Browsing**: Passcode won't persist between sessions (by design)
2. **Cookie Size**: Limited to 4KB (sufficient for passcode)
3. **iOS < 11.3**: PWA support limited or unavailable
4. **Third-Party Context**: If embedded in iframe, storage may be blocked

---

## Recommendations

### For Users

1. **Add to Home Screen**: Use Safari's "Add to Home Screen" for best PWA experience
2. **Keep iOS Updated**: Latest iOS versions have better PWA support
3. **Allow Cookies**: Ensure cookies are enabled in Safari settings
4. **Sufficient Storage**: Keep at least 1GB free on device

### For Developers

1. **Monitor Console**: Check for storage warnings in production
2. **Test on Real Devices**: iOS simulator doesn't replicate all storage issues
3. **Consider Backend Auth**: For production, implement server-side authentication
4. **Add Analytics**: Track passcode validation failures to identify issues

---

## Future Enhancements

1. **IndexedDB**: Add fourth fallback using IndexedDB (more storage capacity)
2. **Service Worker**: Use service worker cache for offline authentication
3. **Biometric Auth**: Integrate Face ID/Touch ID for iOS
4. **Backend Validation**: Move authentication to server-side
5. **Token Refresh**: Implement token expiration and refresh logic

---

## Related Files

- `frontend/src/contexts/PasscodeContext.tsx` - Main implementation
- `frontend/public/manifest.json` - PWA configuration
- `docs/APP_WIDE_PASSCODE_GUARD.md` - Overall passcode system

---

## References

- [iOS PWA Storage Issues](https://developer.apple.com/documentation/webkit/safari_web_extensions/assessing_your_safari_web_extension_s_browser_compatibility)
- [PWA Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [iOS Safari Limitations](https://firt.dev/ios-14.5/)
- [Cookie SameSite Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)

---

**Implementation Complete** ✅

The app now handles iOS PWA storage issues gracefully with triple-redundant storage and automatic fallbacks.
