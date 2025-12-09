"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

interface PasscodeContextType {
  passcodeValid: boolean;
  validatePasscode: (passcode: string) => boolean;
  logout: () => void;
}

const PasscodeContext = createContext<PasscodeContextType | undefined>(
  undefined
);

interface PasscodeProviderProps {
  children: ReactNode;
}

const CORRECT_PASSCODE = "wyat2024";
const STORAGE_KEY = "journal_passcode";

// Helper to safely access storage with iOS PWA fallbacks
function getStoredPasscode(): string | null {
  if (typeof window === "undefined") return null;

  try {
    // Try localStorage first (works in most cases)
    const fromLocal = localStorage.getItem(STORAGE_KEY);
    if (fromLocal) return fromLocal;

    // Fallback to sessionStorage (persists during app session in iOS PWA)
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    if (fromSession) {
      // Restore to localStorage if possible
      try {
        localStorage.setItem(STORAGE_KEY, fromSession);
      } catch (e) {
        console.warn("localStorage unavailable, using sessionStorage");
      }
      return fromSession;
    }

    // Fallback to cookie (most reliable for iOS PWA)
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [key, value] = cookie.trim().split("=");
      if (key === STORAGE_KEY) {
        // Restore to localStorage if possible
        try {
          localStorage.setItem(STORAGE_KEY, value);
          sessionStorage.setItem(STORAGE_KEY, value);
        } catch (e) {
          console.warn("Storage unavailable, using cookie only");
        }
        return value;
      }
    }

    return null;
  } catch (error) {
    console.error("Error reading stored passcode:", error);
    return null;
  }
}

// Helper to safely store passcode with iOS PWA fallbacks
function storePasscode(passcode: string): void {
  if (typeof window === "undefined") return;

  try {
    // Store in localStorage
    localStorage.setItem(STORAGE_KEY, passcode);
  } catch (e) {
    console.warn("localStorage.setItem failed:", e);
  }

  try {
    // Also store in sessionStorage (fallback for iOS PWA)
    sessionStorage.setItem(STORAGE_KEY, passcode);
  } catch (e) {
    console.warn("sessionStorage.setItem failed:", e);
  }

  try {
    // Store in cookie with long expiration (most reliable for iOS PWA)
    // Expires in 365 days
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `${STORAGE_KEY}=${passcode};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
  } catch (e) {
    console.warn("Cookie storage failed:", e);
  }
}

// Helper to safely remove passcode from all storage locations
function removePasscode(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("localStorage.removeItem failed:", e);
  }

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("sessionStorage.removeItem failed:", e);
  }

  try {
    // Remove cookie by setting expiration to past date
    document.cookie = `${STORAGE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Strict`;
  } catch (e) {
    console.warn("Cookie removal failed:", e);
  }
}

export function PasscodeProvider({ children }: PasscodeProviderProps) {
  const [passcodeValid, setPasscodeValid] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [mounted, setMounted] = useState(false);

  // Check storage for passcode on mount with iOS PWA fallbacks
  useEffect(() => {
    setMounted(true);
    const stored = getStoredPasscode();
    if (stored === CORRECT_PASSCODE) {
      setPasscodeValid(true);
      console.log("✅ Passcode validated from storage");
    } else {
      console.log("ℹ️ No valid passcode found in storage");
    }
  }, []);

  const validatePasscode = (code: string): boolean => {
    if (code === CORRECT_PASSCODE) {
      setPasscodeValid(true);
      setPasscodeError("");
      storePasscode(CORRECT_PASSCODE);
      console.log("✅ Passcode validated and stored");
      return true;
    } else {
      setPasscodeError("Incorrect passcode");
      return false;
    }
  };

  const logout = () => {
    setPasscodeValid(false);
    setPasscode("");
    removePasscode();
    console.log("🔓 Passcode cleared");
  };

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validatePasscode(passcode);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return null;
  }

  // If passcode is not valid, show passcode prompt
  if (!passcodeValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 relative z-50">
        <form
          onSubmit={handlePasscodeSubmit}
          className="bg-white dark:bg-gray-800 rounded-lg px-8 py-6 flex flex-col gap-4 shadow-lg border border-gray-200 dark:border-gray-700 w-full max-w-md"
        >
          <div className="text-center mb-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Wyat AI
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Enter passcode to access
            </p>
          </div>
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            placeholder="Enter passcode"
            autoFocus
          />
          {passcodeError && (
            <p className="text-red-500 dark:text-red-400 text-sm text-center">
              {passcodeError}
            </p>
          )}
          <button
            type="submit"
            className="cursor-pointer text-white dark:text-black bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 font-bold text-base px-4 py-3 rounded-md transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  // If passcode is valid, render the app
  const value: PasscodeContextType = {
    passcodeValid,
    validatePasscode,
    logout,
  };

  return (
    <PasscodeContext.Provider value={value}>
      {children}
    </PasscodeContext.Provider>
  );
}

export function usePasscode() {
  const context = useContext(PasscodeContext);
  if (context === undefined) {
    throw new Error("usePasscode must be used within a PasscodeProvider");
  }
  return context;
}
