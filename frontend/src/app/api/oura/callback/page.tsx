"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function OuraCallbackContent() {
  const [countdown, setCountdown] = useState(5);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isError = searchParams.get("error") === "true";

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.push("/services/oura");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
      <div className="text-center space-y-6">
        {isError ? (
          <>
            {/* Error Icon */}
            <div className="relative">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                <svg
                  className="w-8 h-8 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Connection Failed
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Failed to connect with Oura
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Redirecting to services in {countdown} seconds...
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-64 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full mx-auto overflow-hidden">
              <div
                className="h-full bg-red-600 transition-all duration-1000 ease-linear"
                style={{ width: `${((5 - countdown) / 5) * 100}%` }}
              ></div>
            </div>

            {/* Manual Retry Button */}
            <div className="pt-4">
              <button
                onClick={() => router.push("/services/oura")}
                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Loading Spinner */}
            <div className="relative">
              <div className="w-16 h-16 border-4 border-zinc-200 dark:border-zinc-700 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            </div>

            {/* Success Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Welcome to Wyat AI
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                Successfully connected with Oura
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Redirecting to services in {countdown} seconds...
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-64 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full mx-auto overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-1000 ease-linear"
                style={{ width: `${((5 - countdown) / 5) * 100}%` }}
              ></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-zinc-200 dark:border-zinc-700 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Loading...
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Processing Oura connection
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OuraCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OuraCallbackContent />
    </Suspense>
  );
}
